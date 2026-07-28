import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  AuditLogEntryDto,
  IntegrationHealthDto,
  ShipmentAdminDetailDto,
  TrackingResultDto,
} from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/database/redis.service';

const TEST_STAFF_EMAIL = 'e2e-admin-staff@nationwide.dev';
const TEST_STAFF_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500004';
const TEST_PROVIDER_CODE = 'ICL';
const TEST_TRACKING_NUMBERS = ['NW-ADMIN-E2E-1', 'NW-ADMIN-E2E-2'];

describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let staffAccessToken: string;
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
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    // Defensive: a previous failed run's afterAll may not have reached this cleanup.
    await redis.del(...TEST_TRACKING_NUMBERS.map((n) => `tracking:${n}`));

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
        name: 'Admin Test Customer',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
        consentGivenAt: new Date(),
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await redis.del(...TEST_TRACKING_NUMBERS.map((n) => `tracking:${n}`));
    const staff = await prisma.adminUser.findUnique({
      where: { email: TEST_STAFF_EMAIL },
    });
    if (staff) {
      await prisma.auditLog.deleteMany({ where: { actorId: staff.id } });
    }
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
    await prisma.adminUser.deleteMany({ where: { email: TEST_STAFF_EMAIL } });
    await app.close();
  });

  it('rejects admin endpoints with no token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/shipments/NW-ANY')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/integrations/ICL/health')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .expect(401);
  });

  it('rejects admin endpoints for a CUSTOMER-role token', async () => {
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
      .get('/api/v1/admin/shipments/NW-ANY')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('returns 404 for an unknown tracking number', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/shipments/NW-DOES-NOT-EXIST')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(404);
  });

  it('returns 404 for an unknown provider code on the health endpoint', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/integrations/NOT-A-PROVIDER/health')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(404);
  });

  it(
    'lets staff fully operate the tracking mapping workflow: view, map, and override, ' +
      'with the public endpoint and audit trail reflecting each step',
    async () => {
      const order = await prisma.order.create({ data: { customerId } });
      const shipment = await prisma.shipment.create({
        data: {
          orderId: order.id,
          providerId,
          internalTrackingNumber: 'NW-ADMIN-E2E-1',
        },
      });

      // 1. Staff view before any mapping exists.
      const initialView = await request(app.getHttpServer())
        .get(`/api/v1/admin/shipments/${shipment.internalTrackingNumber}`)
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(200);
      const initialDetail = initialView.body as ShipmentAdminDetailDto;
      expect(initialDetail.externalTrackingNumbers).toEqual([]);
      expect(initialDetail.events).toEqual([]);

      // 2. Public endpoint reports "not yet available" before mapping.
      const beforeMapping = await request(app.getHttpServer())
        .get(`/api/v1/tracking/${shipment.internalTrackingNumber}`)
        .expect(200);
      expect(
        (beforeMapping.body as TrackingResultDto).currentStatus,
      ).toBeNull();

      // 3. Staff maps the external tracking number.
      const mapRes = await request(app.getHttpServer())
        .post(
          `/api/v1/admin/shipments/${shipment.internalTrackingNumber}/external-tracking-number`,
        )
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({ providerId, externalTrackingNumber: 'ICL-E2E-ADMIN-1' })
        .expect(201);
      const mappedDetail = mapRes.body as ShipmentAdminDetailDto;
      expect(mappedDetail.externalTrackingNumbers).toHaveLength(1);
      expect(
        mappedDetail.externalTrackingNumbers[0].externalTrackingNumber,
      ).toBe('ICL-E2E-ADMIN-1');

      // 4. Public endpoint now resolves through the stub adapter.
      const afterMapping = await request(app.getHttpServer())
        .get(`/api/v1/tracking/${shipment.internalTrackingNumber}`)
        .expect(200);
      const afterMappingBody = afterMapping.body as TrackingResultDto;
      expect(afterMappingBody.currentStatus).not.toBeNull();
      expect(afterMappingBody.events.length).toBeGreaterThan(0);

      // 5. Staff manually overrides the status.
      const overrideRes = await request(app.getHttpServer())
        .post(
          `/api/v1/admin/shipments/${shipment.internalTrackingNumber}/override`,
        )
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({
          status: 'DELIVERED',
          location: 'Front Desk',
          note: 'Confirmed by phone',
        })
        .expect(201);
      const overrideDetail = overrideRes.body as ShipmentAdminDetailDto;
      expect(overrideDetail.currentStatus).toBe('DELIVERED');
      expect(
        overrideDetail.events.some(
          (e) =>
            e.rawStatus === 'MANUAL_OVERRIDE' &&
            e.canonicalStatus === 'DELIVERED',
        ),
      ).toBe(true);

      // 6. Public endpoint immediately reflects the override — no stale cache.
      const afterOverride = await request(app.getHttpServer())
        .get(`/api/v1/tracking/${shipment.internalTrackingNumber}`)
        .expect(200);
      expect((afterOverride.body as TrackingResultDto).currentStatus).toBe(
        'DELIVERED',
      );

      // 7. Integration health reflects the real provider calls made during this flow.
      const healthRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/integrations/${TEST_PROVIDER_CODE}/health`)
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(200);
      const health = healthRes.body as IntegrationHealthDto;
      expect(health.totalCalls).toBeGreaterThan(0);
      expect(health.errorCount).toBe(0);

      // 8. Audit log captures both staff actions with correct before/after state.
      const auditRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/audit-logs?entity=Shipment&entityId=${shipment.id}`)
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(200);
      const auditEntries = auditRes.body as AuditLogEntryDto[];
      const actions = auditEntries.map((entry) => entry.action);
      expect(actions).toContain('MAP_EXTERNAL_TRACKING_NUMBER');
      expect(actions).toContain('OVERRIDE_TRACKING_STATUS');
      expect(
        auditEntries.every((entry) => entry.actorEmail === TEST_STAFF_EMAIL),
      ).toBe(true);
    },
  );

  it('rejects an override with an invalid status', async () => {
    const order = await prisma.order.create({ data: { customerId } });
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId,
        internalTrackingNumber: 'NW-ADMIN-E2E-2',
      },
    });

    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/shipments/${shipment.internalTrackingNumber}/override`,
      )
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'NOT_A_REAL_STATUS' })
      .expect(400);
  });
});
