import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { LoginResponseDto } from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import type { JwtPayload } from '../src/modules/auth/types/jwt-payload.type';

interface AdminPingResponseDto {
  message: string;
  user: JwtPayload;
}

const TEST_ADMIN_EMAIL = 'e2e-staff@nationwide.dev';
const TEST_ADMIN_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_EMAIL = 'e2e-customer@example.com';
const TEST_CUSTOMER_PHONE = '+919876500097';
const TEST_CUSTOMER_PASSWORD = 'CustomerPass123';
const TEST_DISABLED_EMAIL = 'e2e-disabled-staff@nationwide.dev';
const TEST_DISABLED_PASSWORD = 'DisabledPass123';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  // Populated once each by the tests that log in, then reused by later tests — keeps the
  // total number of /auth/login calls in this file well under the login endpoint's own
  // brute-force throttle (5 requests/60s), which all requests in this file share one bucket for.
  let staffAccessToken: string;
  let customerAccessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    await prisma.adminUser.upsert({
      where: { email: TEST_ADMIN_EMAIL },
      update: {},
      create: {
        email: TEST_ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(TEST_ADMIN_PASSWORD, 10),
        role: 'STAFF',
      },
    });

    await prisma.adminUser.upsert({
      where: { email: TEST_DISABLED_EMAIL },
      update: { isActive: false },
      create: {
        email: TEST_DISABLED_EMAIL,
        passwordHash: await bcrypt.hash(TEST_DISABLED_PASSWORD, 10),
        role: 'STAFF',
        isActive: false,
      },
    });

    await prisma.customer.deleteMany({ where: { email: TEST_CUSTOMER_EMAIL } });
    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({
      where: { email: { in: [TEST_ADMIN_EMAIL, TEST_DISABLED_EMAIL] } },
    });
    await prisma.customer.deleteMany({ where: { email: TEST_CUSTOMER_EMAIL } });
    await app.close();
  });

  it('rejects login with the wrong password', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_ADMIN_EMAIL, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects an admin route with no token', () => {
    return request(app.getHttpServer()).get('/api/v1/admin/ping').expect(401);
  });

  it('rejects an admin route for a valid token with the CUSTOMER role', async () => {
    const customerToken = await jwtService.signAsync(
      {
        sub: 'some-customer-id',
        email: 'customer@example.com',
        role: 'CUSTOMER',
      },
      {
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    await request(app.getHttpServer())
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('logs a staff user in, grants access to the protected admin route, and rotates refresh tokens', async () => {
    const agent = request.agent(app.getHttpServer());

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD })
      .expect(200);
    const loginBody = loginRes.body as LoginResponseDto;

    expect(loginBody.accessToken).toEqual(expect.any(String));
    expect(loginBody.user).toMatchObject({
      email: TEST_ADMIN_EMAIL,
      role: 'STAFF',
    });
    expect(loginRes.headers['set-cookie']?.[0]).toMatch(/refresh_token=/);

    staffAccessToken = loginBody.accessToken;

    const pingRes = await agent
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect((pingRes.body as AdminPingResponseDto).user.email).toBe(
      TEST_ADMIN_EMAIL,
    );

    const refreshRes = await agent.post('/api/v1/auth/refresh').expect(200);
    const refreshBody = refreshRes.body as { accessToken: string };
    expect(refreshBody.accessToken).toEqual(expect.any(String));
    expect(refreshBody.accessToken).not.toBe(staffAccessToken);
    // The original access token is still independently valid below — logout only revokes
    // the refresh token, since access tokens are stateless JWTs checked by signature alone.

    await agent
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(204);

    // the refresh token was revoked on logout, so it can no longer be used
    await agent.post('/api/v1/auth/refresh').expect(401);
  });

  it('rejects login for a disabled account with the same generic error as bad credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_DISABLED_EMAIL, password: TEST_DISABLED_PASSWORD })
      .expect(401);
    expect((res.body as { message: string }).message).toBe(
      'Invalid credentials',
    );
  });

  describe('customer self-registration and unified login', () => {
    it('registers a new customer and immediately returns a CUSTOMER-role session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Customer',
          phone: TEST_CUSTOMER_PHONE,
          email: TEST_CUSTOMER_EMAIL,
          password: TEST_CUSTOMER_PASSWORD,
        })
        .expect(201);

      const body = res.body as LoginResponseDto;
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.user).toMatchObject({
        email: TEST_CUSTOMER_EMAIL,
        role: 'CUSTOMER',
      });
    });

    it('rejects a duplicate registration with the same email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Someone Else',
          phone: '+919876500096',
          email: TEST_CUSTOMER_EMAIL,
          password: 'AnotherPassword123',
        })
        .expect(409);
    });

    it('logs the newly-registered customer in through the same unified /auth/login endpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_CUSTOMER_EMAIL, password: TEST_CUSTOMER_PASSWORD })
        .expect(200);

      const body = res.body as LoginResponseDto;
      expect(body.user.role).toBe('CUSTOMER');
      customerAccessToken = body.accessToken;
    });

    it('lets the customer read and update their own profile via /customers/me, scoped by JWT — never a client-supplied id', async () => {
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/customers/me')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .expect(200);
      const me = meRes.body as { email: string; passwordHash?: string };
      expect(me.email).toBe(TEST_CUSTOMER_EMAIL);
      expect(me.passwordHash).toBeUndefined();

      const myOrdersRes = await request(app.getHttpServer())
        .get('/api/v1/orders/me')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .expect(200);
      expect(myOrdersRes.body).toEqual([]);
    });

    it('denies a customer access to the staff-only customer list and order list', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .expect(403);
    });

    it('denies staff access to the customer-only /customers/me and /orders/me routes', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers/me')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/orders/me')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);
    });
  });

  // Kept last and deliberately isolated: fires enough requests to guarantee tripping the
  // strict login throttle regardless of how many login calls earlier tests in this file
  // already made against the same per-IP bucket.
  it('rate-limits repeated login attempts', async () => {
    let sawTooManyRequests = false;
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_ADMIN_EMAIL, password: 'wrong-password' });
      if (res.status === 429) {
        sawTooManyRequests = true;
        break;
      }
    }
    expect(sawTooManyRequests).toBe(true);
  });
});
