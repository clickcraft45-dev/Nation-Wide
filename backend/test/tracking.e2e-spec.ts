import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { TrackingResultDto } from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/database/redis.service';
import { nextSequenceNumber } from '../src/modules/shipments/sequence';

const TEST_CUSTOMER_PHONE = '+919876500003';
const TEST_PROVIDER_CODE = 'ICL';

describe('Tracking (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let customerId: string;
  let providerId: string;

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
    redis = app.get(RedisService);

    const provider = await prisma.shippingProvider.upsert({
      where: { code: TEST_PROVIDER_CODE },
      update: { adapterClass: 'StubShippingProviderAdapter' },
      create: {
        code: TEST_PROVIDER_CODE,
        name: 'ICL',
        adapterClass: 'StubShippingProviderAdapter',
      },
    });
    providerId = provider.id;

    for (const status of [
      { code: 'PICKED_UP', displayLabel: 'Picked Up' },
      { code: 'IN_TRANSIT', displayLabel: 'In Transit' },
      { code: 'OUT_FOR_DELIVERY', displayLabel: 'Out for Delivery' },
      { code: 'DELIVERED', displayLabel: 'Delivered' },
      { code: 'EXCEPTION', displayLabel: 'Delivery Exception' },
    ]) {
      await prisma.trackingStatus.upsert({
        where: { code: status.code },
        update: {},
        create: status,
      });
    }

    await prisma.externalTrackingNumber.deleteMany({
      where: {
        shipment: { order: { customer: { phone: TEST_CUSTOMER_PHONE } } },
      },
    });
    await prisma.trackingEvent.deleteMany({
      where: {
        shipment: { order: { customer: { phone: TEST_CUSTOMER_PHONE } } },
      },
    });
    await prisma.shipment.deleteMany({
      where: { order: { customer: { phone: TEST_CUSTOMER_PHONE } } },
    });
    await prisma.order.deleteMany({
      where: { customer: { phone: TEST_CUSTOMER_PHONE } },
    });
    await prisma.notification.deleteMany({
      where: { customer: { phone: TEST_CUSTOMER_PHONE } },
    });
    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
    const customer = await prisma.customer.create({
      data: {
        name: 'Tracking Test Customer',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
        consentGivenAt: new Date(),
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await redis.del('tracking:NW-E2E-MAPPED', 'tracking:NW-E2E-UNMAPPED');
    await prisma.externalTrackingNumber.deleteMany({
      where: { shipment: { order: { customerId } } },
    });
    await prisma.trackingEvent.deleteMany({
      where: { shipment: { order: { customerId } } },
    });
    await prisma.shipment.deleteMany({ where: { order: { customerId } } });
    await prisma.order.deleteMany({ where: { customerId } });
    await prisma.notification.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await app.close();
  });

  it('returns 404 for a tracking number that does not exist', () => {
    return request(app.getHttpServer())
      .get('/api/v1/tracking/NW-DOES-NOT-EXIST')
      .expect(404);
  });

  it('returns "not yet available" for a shipment with no mapped external tracking number', async () => {
    const order = await prisma.order.create({ data: { customerId } });
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId,
        sequenceNumber: await nextSequenceNumber(prisma),
        internalTrackingNumber: 'NW-E2E-UNMAPPED',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/tracking/${shipment.internalTrackingNumber}`)
      .expect(200);
    const body = res.body as TrackingResultDto;

    expect(body.currentStatus).toBeNull();
    expect(body.currentStatusLabel).toBe('Tracking not yet available');
    expect(body.events).toEqual([]);
  });

  it('returns a normalized result from the stub adapter end-to-end, with caching', async () => {
    const order = await prisma.order.create({ data: { customerId } });
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId,
        sequenceNumber: await nextSequenceNumber(prisma),
        internalTrackingNumber: 'NW-E2E-MAPPED',
      },
    });
    await prisma.externalTrackingNumber.create({
      data: {
        shipmentId: shipment.id,
        providerId,
        externalTrackingNumber: 'ICL-E2E-000001',
      },
    });

    const firstRes = await request(app.getHttpServer())
      .get(`/api/v1/tracking/${shipment.internalTrackingNumber}`)
      .expect(200);
    const first = firstRes.body as TrackingResultDto;

    expect(first.internalTrackingNumber).toBe('NW-E2E-MAPPED');
    expect(first.currentStatus).not.toBeNull();
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.lastUpdated).toEqual(expect.any(String));

    // Confirm it's actually cached in Redis, not just idempotent by chance.
    const cached = await redis.get('tracking:NW-E2E-MAPPED');
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toEqual(first);

    // A second request should return the identical cached payload.
    const secondRes = await request(app.getHttpServer())
      .get(`/api/v1/tracking/${shipment.internalTrackingNumber}`)
      .expect(200);
    expect(secondRes.body).toEqual(first);

    // Persisted to the append-only tracking history, not just the cache.
    const persistedEvents = await prisma.trackingEvent.count({
      where: { shipmentId: shipment.id },
    });
    expect(persistedEvents).toBe(first.events.length);
  });
});
