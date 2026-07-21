import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { OrderDto } from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const TEST_STAFF_EMAIL = 'e2e-orders-staff@nationwide.dev';
const TEST_STAFF_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500002';
const TEST_PROVIDER_CODE = 'ICL';

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let staffAccessToken: string;
  let customerId: string;

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

    await prisma.shippingProvider.upsert({
      where: { code: TEST_PROVIDER_CODE },
      update: {},
      create: {
        code: TEST_PROVIDER_CODE,
        name: 'ICL',
        adapterClass: 'ICLAdapter',
      },
    });

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

    await prisma.shipment.deleteMany({
      where: { order: { customer: { phone: TEST_CUSTOMER_PHONE } } },
    });
    await prisma.order.deleteMany({
      where: { customer: { phone: TEST_CUSTOMER_PHONE } },
    });
    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
    const customer = await prisma.customer.create({
      data: {
        name: 'Order Test Customer',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
        consentGivenAt: new Date(),
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.shipment.deleteMany({ where: { order: { customerId } } });
    await prisma.order.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.adminUser.deleteMany({ where: { email: TEST_STAFF_EMAIL } });
    await app.close();
  });

  it('rejects an unauthenticated create request', () => {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ customerId })
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
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ customerId })
      .expect(403);
  });

  it('rejects an order for a customer that does not exist', () => {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ customerId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('rejects an unknown provider code', () => {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ customerId, providerCode: 'NOT-A-REAL-PROVIDER' })
      .expect(400);
  });

  it('lets staff create an order that produces a shipment with a generated internal tracking number', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ customerId })
      .expect(201);
    const order = createRes.body as OrderDto;

    expect(order.customerId).toBe(customerId);
    expect(order.status).toBe('PENDING');
    expect(order.shipments).toHaveLength(1);
    expect(order.shipments[0].internalTrackingNumber).toMatch(
      /^NW-[A-Z0-9]{10}$/,
    );

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect((getRes.body as OrderDto).shipments[0].internalTrackingNumber).toBe(
      order.shipments[0].internalTrackingNumber,
    );

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect((updateRes.body as OrderDto).status).toBe('CONFIRMED');
  });
});
