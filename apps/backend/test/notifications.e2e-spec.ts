import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const TEST_STAFF_EMAIL = 'e2e-notifications-staff@nationwide.dev';
const TEST_STAFF_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500005';
const TEST_PROVIDER_CODE = 'ICL';

interface NotificationRow {
  id: string;
  status: string;
  template: string;
  providerMessageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
}

async function waitForStatus(
  prisma: PrismaService,
  notificationId: string,
  expectedStatuses: string[],
  timeoutMs = 3000,
): Promise<NotificationRow> {
  const start = Date.now();
  for (;;) {
    const notification = await prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    if (expectedStatuses.includes(notification.status)) {
      return notification;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Notification ${notificationId} did not reach [${expectedStatuses.join(', ')}] within ${timeoutMs}ms (last status: ${notification.status})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let staffAccessToken: string;
  let customerId: string;
  let providerId: string;
  let webhookVerifyToken: string;

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
    webhookVerifyToken = configService.getOrThrow<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );

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

    await prisma.notification.deleteMany({
      where: { customer: { phone: TEST_CUSTOMER_PHONE } },
    });
    await prisma.trackingEvent.deleteMany({
      where: { shipment: { order: { customer: { phone: TEST_CUSTOMER_PHONE } } } },
    });
    await prisma.shipment.deleteMany({
      where: { order: { customer: { phone: TEST_CUSTOMER_PHONE } } },
    });
    await prisma.order.deleteMany({
      where: { customer: { phone: TEST_CUSTOMER_PHONE } },
    });
    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
    const customer = await prisma.customer.create({
      data: {
        name: 'Notifications Test Customer',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
        consentGivenAt: new Date(),
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { customerId } });
    await prisma.trackingEvent.deleteMany({
      where: { shipment: { order: { customerId } } },
    });
    await prisma.shipment.deleteMany({ where: { order: { customerId } } });
    await prisma.order.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.auditLog.deleteMany({
      where: { actor: { email: TEST_STAFF_EMAIL } },
    });
    await prisma.adminUser.deleteMany({ where: { email: TEST_STAFF_EMAIL } });
    await app.close();
  });

  it('rejects the webhook verification handshake with the wrong token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': 'abc',
      })
      .expect(403);
  });

  it('accepts the webhook verification handshake and echoes the challenge', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': webhookVerifyToken,
        'hub.challenge': 'echo-me-123',
      })
      .expect(200);
    expect(res.text).toBe('echo-me-123');
  });

  it('creating an order enqueues and sends an order_confirmation notification', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ customerId })
      .expect(201);

    const created = await prisma.notification.findFirstOrThrow({
      where: { customerId, template: 'order_confirmation' },
      orderBy: { createdAt: 'desc' },
    });
    // The stub adapter resolves near-instantly, so the worker may already have
    // processed the job by the time we read it back — QUEUED and SENT are both
    // valid observations here, unlike the final state asserted via waitForStatus below.
    expect(['QUEUED', 'SENT']).toContain(created.status);
    expect(created.channel).toBe('WHATSAPP');

    const sent = await waitForStatus(prisma, created.id, ['SENT']);
    expect(sent.providerMessageId).toMatch(/^stub-wamid-/);
    expect(sent.sentAt).not.toBeNull();
  });

  it('overriding tracking status enqueues and sends a status-change notification', async () => {
    const order = await prisma.order.create({ data: { customerId } });
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId,
        internalTrackingNumber: 'NW-NOTIF-E2E-1',
      },
    });

    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/shipments/${shipment.internalTrackingNumber}/override`,
      )
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ status: 'DELIVERED' })
      .expect(201);

    const created = await prisma.notification.findFirstOrThrow({
      where: { customerId, template: 'delivered' },
      orderBy: { createdAt: 'desc' },
    });

    const sent = await waitForStatus(prisma, created.id, ['SENT']);
    expect(sent.providerMessageId).toMatch(/^stub-wamid-/);
  });

  it('a delivery-status webhook callback updates the matching notification', async () => {
    const notification = await prisma.notification.create({
      data: {
        customerId,
        channel: 'WHATSAPP',
        template: 'order_confirmation',
        status: 'SENT',
        providerMessageId: 'test-wamid-webhook-1',
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'test-wamid-webhook-1',
                      status: 'delivered',
                      timestamp: '1700000000',
                      recipient_id: '919876500005',
                    },
                  ],
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    const updated = await prisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(updated.status).toBe('DELIVERED');
    expect(updated.deliveredAt).not.toBeNull();
  });

  it('ignores a webhook payload for an unknown providerMessageId without erroring', () => {
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'no-such-message-id',
                      status: 'delivered',
                      timestamp: '1',
                    },
                  ],
                },
              },
            ],
          },
        ],
      })
      .expect(200);
  });

  it('tolerates a malformed webhook payload without erroring', () => {
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .send({ unexpected: 'shape' })
      .expect(200);
  });
});
