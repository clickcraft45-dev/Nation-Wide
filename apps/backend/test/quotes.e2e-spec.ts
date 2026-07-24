import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { QuoteDto, QuoteAdminDetailDto } from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const TEST_STAFF_EMAIL = 'e2e-quotes-staff@nationwide.dev';
const TEST_STAFF_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500003';
const TEST_PROVIDER_CODE = 'ICL';

const baseOrigin = {
  name: 'Sender',
  phone: '9876543210',
  addressLine1: '123 Main St',
  city: 'Hyderabad',
  state: 'TG',
  postalCode: '500001',
  country: 'India',
};

const baseDestination = {
  name: 'Receiver',
  phone: '9999999999',
  addressLine1: '456 Oak Ave',
  city: 'Chicago',
  state: 'IL',
  postalCode: '60601',
  country: 'USA',
};

function pickupDateInWindow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

describe('Quotes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let staffAccessToken: string;
  let customerAccessToken: string;
  let customerId: string;

  async function signToken(sub: string, email: string, role: 'CUSTOMER' | 'STAFF' | 'ADMIN') {
    return jwtService.signAsync(
      { sub, email, role },
      {
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    await prisma.shippingProvider.upsert({
      where: { code: TEST_PROVIDER_CODE },
      update: {},
      create: { code: TEST_PROVIDER_CODE, name: 'ICL', adapterClass: 'ICLAdapter' },
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
    staffAccessToken = await signToken(staff.id, staff.email, 'STAFF');

    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
    const customer = await prisma.customer.create({
      data: {
        name: 'Quote Test Customer',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
        consentGivenAt: new Date(),
      },
    });
    customerId = customer.id;
    customerAccessToken = await signToken(customerId, 'quote-e2e@example.com', 'CUSTOMER');
  });

  afterAll(async () => {
    const quotes = await prisma.quote.findMany({ where: { customerId } });
    const orderIds = quotes.map((q) => q.orderId).filter((id): id is string => !!id);
    await prisma.pickup.deleteMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } });
    await prisma.auditLog.deleteMany({
      where: { entity: { in: ['Quote', 'Pickup'] }, entityId: { in: quotes.map((q) => q.id) } },
    });
    await prisma.notification.deleteMany({ where: { customerId } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.quote.deleteMany({ where: { customerId } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.adminUser.deleteMany({ where: { email: TEST_STAFF_EMAIL } });
    await app.close();
  });

  it('rejects an unauthenticated create request', () => {
    return request(app.getHttpServer())
      .post('/api/v1/quotes')
      .send({
        shipmentType: 'PARCEL',
        weightKg: 5,
        origin: baseOrigin,
        destination: baseDestination,
        fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
        submissionKey: 'e2e-key-1',
      })
      .expect(401);
  });

  it('rejects a STAFF-role token on the customer create route', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({
        shipmentType: 'PARCEL',
        weightKg: 5,
        origin: baseOrigin,
        destination: baseDestination,
        fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
        submissionKey: 'e2e-key-staff',
      })
      .expect(403);
  });

  it('rejects a CUSTOMER-role token on admin quote routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/quotes')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(403);
  });

  it('full flow: submit -> appears in /quotes/me -> staff quotes it -> customer accepts -> real Order/Shipment/Pickup exist', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        shipmentType: 'PARCEL',
        weightKg: 5,
        origin: baseOrigin,
        destination: baseDestination,
        fulfillmentMethod: 'PICKUP',
        pickupDate: pickupDateInWindow(),
        pickupTimeSlot: '09:00-12:00',
        submissionKey: 'e2e-key-full-flow',
      })
      .expect(201);
    const created = createRes.body as QuoteDto;
    expect(created.status).toBe('SUBMITTED');
    expect(created.customerId).toBe(customerId);

    const mineRes = await request(app.getHttpServer())
      .get('/api/v1/quotes/me')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(200);
    expect((mineRes.body as QuoteDto[]).some((q) => q.id === created.id)).toBe(true);

    const adminListRes = await request(app.getHttpServer())
      .get('/api/v1/admin/quotes')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect(
      (adminListRes.body as QuoteAdminDetailDto[]).some((q) => q.id === created.id),
    ).toBe(true);

    const quotedRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/quotes/${created.id}/manual-quote`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ amount: 1200, currency: 'INR' })
      .expect(201);
    expect((quotedRes.body as QuoteAdminDetailDto).status).toBe('QUOTED');
    expect((quotedRes.body as QuoteAdminDetailDto).quotedAmount).toBe(1200);

    // Not yet QUOTED->QUOTED again should be fine, but accepting before QUOTED should fail —
    // already covered at the unit level; here we confirm the accept call itself succeeds.
    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${created.id}/accept`)
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(201);
    const accepted = acceptRes.body as QuoteDto;
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.orderId).toBeTruthy();

    const order = await prisma.order.findUnique({
      where: { id: accepted.orderId! },
      include: { shipments: true },
    });
    expect(order).not.toBeNull();
    expect(order!.shipments).toHaveLength(1);
    expect(order!.shipments[0].internalTrackingNumber).toMatch(/^NW-\d{2}-\d{8}$/);

    const pickup = await prisma.pickup.findUnique({ where: { quoteId: created.id } });
    expect(pickup).not.toBeNull();
    expect(pickup!.method).toBe('PICKUP');
    expect(pickup!.orderId).toBe(accepted.orderId);

    const adminPickupsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/pickups')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect(
      (adminPickupsRes.body as { id: string }[]).some((p) => p.id === pickup!.id),
    ).toBe(true);

    const dropOffsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/pickups/drop-offs')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect(
      (dropOffsRes.body as { id: string }[]).some((p) => p.id === pickup!.id),
    ).toBe(false);
  });

  it('flags an OTHER-type submission for manual review and lets staff reject it', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        shipmentType: 'OTHER',
        weightKg: 2,
        origin: baseOrigin,
        destination: baseDestination,
        fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
        submissionKey: 'e2e-key-misc',
      })
      .expect(201);
    const created = createRes.body as QuoteDto;
    expect(created.status).toBe('NEEDS_MANUAL_REVIEW');
    expect(created.reviewReason).toBe('MISCELLANEOUS');

    const rejectedRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/quotes/${created.id}/reject`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ reason: 'Restricted item' })
      .expect(201);
    expect((rejectedRes.body as QuoteAdminDetailDto).status).toBe('REJECTED');
  });

  it('returns the same quote on a duplicate submissionKey instead of creating a second row', async () => {
    const payload = {
      shipmentType: 'DOCUMENT',
      weightKg: 1,
      origin: baseOrigin,
      destination: baseDestination,
      fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
      submissionKey: 'e2e-key-dup',
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send(payload)
      .expect(201);

    expect((second.body as QuoteDto).id).toBe((first.body as QuoteDto).id);

    const count = await prisma.quote.count({ where: { submissionKey: 'e2e-key-dup' } });
    expect(count).toBe(1);
  });
});
