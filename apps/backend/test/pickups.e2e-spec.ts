import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PickupDto } from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const TEST_STAFF_EMAIL = 'e2e-pickups-staff@nationwide.dev';
const TEST_STAFF_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500004';
const TEST_PROVIDER_CODE = 'ICL';

describe('Pickups (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let staffAccessToken: string;
  let customerId: string;
  let pickupQuoteId: string;
  let pickupId: string;
  let dropOffPickupId: string;

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

    const provider = await prisma.shippingProvider.upsert({
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
        name: 'Pickup Test Customer',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
        consentGivenAt: new Date(),
      },
    });
    customerId = customer.id;

    // Bypass the full quote flow here (already covered by quotes.e2e-spec.ts) — create the
    // Quote+Order+Pickup rows directly so this file can focus on pickup status transitions.
    async function createPickupFor(method: 'PICKUP' | 'WAREHOUSE_DROP_OFF') {
      const quote = await prisma.quote.create({
        data: {
          customerId,
          shipmentType: 'PARCEL',
          weightKg: 3,
          originName: 'S', originPhone: '1', originAddressLine1: 'A', originCity: 'C',
          originState: 'S', originPostalCode: '1', originCountry: 'IN',
          destName: 'R', destPhone: '2', destAddressLine1: 'B', destCity: 'D',
          destState: 'S', destPostalCode: '2', destCountry: 'US',
          fulfillmentMethod: method,
          status: 'ACCEPTED',
          submissionKey: `e2e-pickup-setup-${method}-${Date.now()}`,
        },
      });
      const order = await prisma.order.create({ data: { customerId } });
      const shipmentPlaceholder = await prisma.shipment.create({
        data: { orderId: order.id, providerId: provider.id, internalTrackingNumber: `PENDING-${order.id}` },
      });
      await prisma.shipment.update({
        where: { id: shipmentPlaceholder.id },
        data: { internalTrackingNumber: `NW-TEST-${shipmentPlaceholder.sequenceNumber}` },
      });
      await prisma.quote.update({ where: { id: quote.id }, data: { orderId: order.id } });
      const pickup = await prisma.pickup.create({
        data: {
          quoteId: quote.id,
          orderId: order.id,
          method,
          scheduledDate: method === 'PICKUP' ? new Date() : null,
          scheduledTimeSlot: method === 'PICKUP' ? '09:00-12:00' : null,
        },
      });
      return { quoteId: quote.id, pickupId: pickup.id };
    }

    const pickupSetup = await createPickupFor('PICKUP');
    pickupQuoteId = pickupSetup.quoteId;
    pickupId = pickupSetup.pickupId;

    const dropOffSetup = await createPickupFor('WAREHOUSE_DROP_OFF');
    dropOffPickupId = dropOffSetup.pickupId;
  });

  afterAll(async () => {
    const quotes = await prisma.quote.findMany({ where: { customerId } });
    const orderIds = quotes.map((q) => q.orderId).filter((id): id is string => !!id);
    await prisma.pickup.deleteMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } });
    await prisma.auditLog.deleteMany({
      where: { entity: 'Pickup', entityId: { in: [pickupId, dropOffPickupId] } },
    });
    await prisma.notification.deleteMany({ where: { customerId } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.quote.deleteMany({ where: { customerId } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.adminUser.deleteMany({ where: { email: TEST_STAFF_EMAIL } });
    await app.close();
  });

  it('rejects a CUSTOMER-role token on admin pickup routes', async () => {
    const customerToken = await signToken(customerId, 'pickup-e2e@example.com', 'CUSTOMER');
    await request(app.getHttpServer())
      .get('/api/v1/admin/pickups')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('drop-offs list excludes PICKUP-method rows, and vice versa', async () => {
    const pickupsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/pickups')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    const pickupIds = (pickupsRes.body as PickupDto[]).map((p) => p.id);
    expect(pickupIds).toContain(pickupId);
    expect(pickupIds).not.toContain(dropOffPickupId);

    const dropOffsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/pickups/drop-offs')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    const dropOffIds = (dropOffsRes.body as PickupDto[]).map((p) => p.id);
    expect(dropOffIds).toContain(dropOffPickupId);
    expect(dropOffIds).not.toContain(pickupId);
  });

  it('walks a PICKUP through its full valid transition chain', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickups/${pickupId}/status`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'PENDING' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickups/${pickupId}/status`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'ASSIGNED' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickups/${pickupId}/status`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'PICKUP_IN_PROGRESS' })
      .expect(200);

    const finalRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickups/${pickupId}/status`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'PICKED_UP', weightVerifiedKg: 2.9 })
      .expect(200);
    const final = finalRes.body as PickupDto;
    expect(final.status).toBe('PICKED_UP');
    expect(final.confirmedByAdminEmail).toBe(TEST_STAFF_EMAIL);
    expect(final.confirmedAt).not.toBeNull();
  });

  it('400s on an out-of-order status jump', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickups/${dropOffPickupId}/status`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'PICKED_UP' }) // not a valid state for WAREHOUSE_DROP_OFF at all
      .expect(400);
  });

  it('confirms a warehouse drop-off directly from SCHEDULED', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickups/${dropOffPickupId}/status`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'DROPPED_OFF' })
      .expect(200);
    expect((res.body as PickupDto).status).toBe('DROPPED_OFF');
  });
});
