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

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

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
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: TEST_ADMIN_EMAIL } });
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

    const accessToken = loginBody.accessToken;

    const pingRes = await agent
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((pingRes.body as AdminPingResponseDto).user.email).toBe(
      TEST_ADMIN_EMAIL,
    );

    const refreshRes = await agent.post('/api/v1/auth/refresh').expect(200);
    const refreshBody = refreshRes.body as { accessToken: string };
    expect(refreshBody.accessToken).toEqual(expect.any(String));
    expect(refreshBody.accessToken).not.toBe(accessToken);

    await agent
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // the refresh token was revoked on logout, so it can no longer be used
    await agent.post('/api/v1/auth/refresh').expect(401);
  });
});
