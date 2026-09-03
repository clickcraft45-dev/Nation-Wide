import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { CustomerDto } from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const TEST_STAFF_EMAIL = 'e2e-customers-staff@nationwide.dev';
const TEST_STAFF_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500001';

describe('Customers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let staffAccessToken: string;

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

    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
    const staff = await prisma.adminUser.upsert({
      where: { email: TEST_STAFF_EMAIL },
      update: {},
      create: {
        email: TEST_STAFF_EMAIL,
        passwordHash: await bcrypt.hash(TEST_STAFF_PASSWORD, 10),
        role: 'STAFF',
      },
    });

    staffAccessToken = await jwtService.signAsync(
      { sub: staff.id, email: staff.email, role: staff.role },
      {
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
    await prisma.adminUser.deleteMany({ where: { email: TEST_STAFF_EMAIL } });
    await app.close();
  });

  it('rejects an unauthenticated create request', () => {
    return request(app.getHttpServer())
      .post('/api/v1/customers')
      .send({
        name: 'Jane Doe',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'signup_form',
      })
      .expect(401);
  });

  it('rejects a CUSTOMER-role token', async () => {
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
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Jane Doe',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'signup_form',
      })
      .expect(403);
  });

  it('rejects a malformed phone number', () => {
    return request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({
        name: 'Jane Doe',
        phone: 'not-a-phone-number',
        consentSource: 'signup_form',
      })
      .expect(400);
  });

  it('lets staff create, view, and edit a customer, stamping consent capture', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({
        name: 'Jane Doe',
        phone: TEST_CUSTOMER_PHONE,
        email: 'jane@example.com',
        consentSource: 'signup_form',
      })
      .expect(201);
    const created = createRes.body as CustomerDto;

    expect(created.id).toEqual(expect.any(String));
    expect(created.consentGivenAt).toEqual(expect.any(String));
    expect(created.consentSource).toBe('signup_form');

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/${created.id}`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect((getRes.body as CustomerDto).phone).toBe(TEST_CUSTOMER_PHONE);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/customers/${created.id}`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ name: 'Jane R. Doe' })
      .expect(200);
    expect((updateRes.body as CustomerDto).name).toBe('Jane R. Doe');
  });

  it('rejects creating a second customer with the same phone number', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({
        name: 'Duplicate Phone',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
      })
      .expect(409);
  });
});
