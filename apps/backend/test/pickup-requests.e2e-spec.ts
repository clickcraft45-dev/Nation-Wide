import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  QuoteDto,
  PickupRequestDto,
  PickupPartnerDashboardSummaryDto,
} from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RatesService } from '../src/modules/pricing/rates.service';

const TEST_STAFF_EMAIL = 'e2e-pr-staff@nationwide.dev';
const TEST_PARTNER_EMAIL = 'e2e-pr-partner@nationwide.dev';
const TEST_OTHER_PARTNER_EMAIL = 'e2e-pr-partner-2@nationwide.dev';
const TEST_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500099';
const TEST_RATE_PROVIDER_CODE = 'E2E_PICKUP_REQUEST_PROVIDER';
const TEST_COUNTRY_CODE = 'E6';
const TEST_COUNTRY_NAME = 'E2E Pickup Request Test Country';

const baseDestination = {
  name: 'Receiver',
  phone: '9999999999',
  addressLine1: '456 Oak Ave',
  city: 'Chicago',
  state: 'IL',
  postalCode: '60601',
  country: TEST_COUNTRY_NAME,
};

function pickupDateInWindow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

describe('Pickup Requests (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let staffAccessToken: string;
  let partnerAccessToken: string;
  let otherPartnerAccessToken: string;
  let customerAccessToken: string;
  let customerId: string;
  let staffId: string;
  let partnerId: string;
  let otherPartnerId: string;
  let rateProviderId: string;

  async function signToken(
    sub: string,
    email: string,
    role: 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'PICKUP_PARTNER',
  ) {
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

    const staff = await prisma.adminUser.upsert({
      where: { email: TEST_STAFF_EMAIL },
      update: {},
      create: {
        email: TEST_STAFF_EMAIL,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        role: 'STAFF',
      },
    });
    staffId = staff.id;
    staffAccessToken = await signToken(staff.id, staff.email, 'STAFF');

    const partner = await prisma.adminUser.upsert({
      where: { email: TEST_PARTNER_EMAIL },
      update: {},
      create: {
        email: TEST_PARTNER_EMAIL,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        role: 'PICKUP_PARTNER',
        name: 'E2E Partner One',
      },
    });
    partnerId = partner.id;
    partnerAccessToken = await signToken(
      partner.id,
      partner.email,
      'PICKUP_PARTNER',
    );

    const otherPartner = await prisma.adminUser.upsert({
      where: { email: TEST_OTHER_PARTNER_EMAIL },
      update: {},
      create: {
        email: TEST_OTHER_PARTNER_EMAIL,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        role: 'PICKUP_PARTNER',
        name: 'E2E Partner Two',
      },
    });
    otherPartnerId = otherPartner.id;
    otherPartnerAccessToken = await signToken(
      otherPartner.id,
      otherPartner.email,
      'PICKUP_PARTNER',
    );

    await prisma.customer.deleteMany({ where: { phone: TEST_CUSTOMER_PHONE } });
    const customer = await prisma.customer.create({
      data: {
        name: 'Pickup Request Test Customer',
        phone: TEST_CUSTOMER_PHONE,
        consentSource: 'staff_entry',
        consentGivenAt: new Date(),
      },
    });
    customerId = customer.id;
    customerAccessToken = await signToken(
      customerId,
      'pr-e2e@example.com',
      'CUSTOMER',
    );

    const country = await prisma.country.upsert({
      where: { code: TEST_COUNTRY_CODE },
      update: {},
      create: { code: TEST_COUNTRY_CODE, name: TEST_COUNTRY_NAME },
    });

    const rateProvider = await prisma.rateProvider.upsert({
      where: { code: TEST_RATE_PROVIDER_CODE },
      update: { fuelChargePercent: 10, pssPerKg: 10 },
      create: {
        code: TEST_RATE_PROVIDER_CODE,
        name: 'E2E Pickup Request Test Provider',
        fuelChargePercent: 10,
        pssPerKg: 10,
      },
    });
    rateProviderId = rateProvider.id;

    const zone = await prisma.zone.upsert({
      where: {
        rateProviderId_name: {
          rateProviderId: rateProvider.id,
          name: 'Zone A',
        },
      },
      update: {},
      create: { rateProviderId: rateProvider.id, name: 'Zone A' },
    });
    await prisma.zoneCountry.upsert({
      where: {
        rateProviderId_countryId: {
          rateProviderId: rateProvider.id,
          countryId: country.id,
        },
      },
      update: { zoneId: zone.id },
      create: {
        zoneId: zone.id,
        countryId: country.id,
        rateProviderId: rateProvider.id,
      },
    });

    const ratesService = app.get(RatesService);
    await ratesService.create(
      {
        zoneId: zone.id,
        shipmentType: 'PARCEL',
        weightFromKg: 0,
        weightToKg: 100,
        baseRate: 500,
        gstPercent: 18,
        nationwideCut: 100,
      },
      staff.id,
    );
  });

  afterAll(async () => {
    const quotes = await prisma.quote.findMany({ where: { customerId } });
    const quoteIds = quotes.map((q) => q.id);
    const orderIds = quotes
      .map((q) => q.orderId)
      .filter((id): id is string => !!id);
    const pickupRequests = await prisma.pickupRequest.findMany({
      where: { customerId },
    });
    const pickupRequestIds = pickupRequests.map((p) => p.id);

    await prisma.auditLog.deleteMany({
      where: { entity: 'PickupRequest', entityId: { in: pickupRequestIds } },
    });
    await prisma.pickupRequest.deleteMany({ where: { customerId } });
    await prisma.rateQuoteOption.deleteMany({
      where: { quoteId: { in: quoteIds } },
    });
    await prisma.pickup.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        entity: { in: ['Quote', 'Pickup'] },
        entityId: { in: quoteIds },
      },
    });
    await prisma.notification.deleteMany({ where: { customerId } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.quote.deleteMany({ where: { customerId } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });

    const staleCards = await prisma.rateCard.findMany({
      where: { zone: { rateProviderId } },
    });
    const staleCardIds = staleCards.map((c) => c.id);
    await prisma.rateQuoteOption.deleteMany({
      where: { rateCardId: { in: staleCardIds } },
    });
    await prisma.weightSlab.deleteMany({
      where: { rateCardId: { in: staleCardIds } },
    });
    await prisma.rateCard.deleteMany({ where: { id: { in: staleCardIds } } });
    await prisma.zoneCountry.deleteMany({ where: { rateProviderId } });
    await prisma.zone.deleteMany({ where: { rateProviderId } });
    await prisma.rateProvider.delete({ where: { id: rateProviderId } });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [staffId, partnerId, otherPartnerId] } },
    });
    await prisma.adminUser.deleteMany({
      where: {
        email: {
          in: [TEST_STAFF_EMAIL, TEST_PARTNER_EMAIL, TEST_OTHER_PARTNER_EMAIL],
        },
      },
    });
    await app.close();
  });

  async function createRatedQuote(submissionKey: string): Promise<QuoteDto> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        shipmentType: 'PARCEL',
        weightKg: 5,
        destination: baseDestination,
        submissionKey,
      })
      .expect(201);
    const quote = res.body as QuoteDto;
    expect(quote.status).toBe('RATED');
    expect(quote.fulfillmentMethod).toBeFalsy();
    return quote;
  }

  describe('RBAC', () => {
    it('rejects STAFF from the customer-facing and partner-facing surfaces', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pickup-requests/me')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/partner/pickup-requests')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch(
          '/api/v1/partner/pickup-requests/00000000-0000-0000-0000-000000000000/arrive',
        )
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);
    });

    it('rejects CUSTOMER from admin and partner surfaces', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/pickup-requests')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/partner/pickup-requests')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pickup-requests/me')
        .expect(401);
    });
  });

  it(
    'full lifecycle: select-option defers order creation -> customer submits pickup request -> ' +
      'admin assigns partner -> partner recalculates/verifies/collects payment/accepts -> ' +
      'real Order/Shipment now exist and are visible in admin',
    async () => {
      const quote = await createRatedQuote('e2e-pr-full-flow');
      const option = quote.rateQuoteOptions[0];
      expect(option.finalPrice).toBe(808);

      // Selecting an option on a fulfillmentMethod-less quote defers to PENDING_PICKUP_REQUEST —
      // no Order is created yet (Section: Order creation sequence — never before verification).
      const selectRes = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${quote.id}/select-option`)
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({ optionId: option.id })
        .expect(201);
      expect((selectRes.body as QuoteDto).status).toBe(
        'PENDING_PICKUP_REQUEST',
      );
      expect((selectRes.body as QuoteDto).orderId).toBeFalsy();

      const createPrRes = await request(app.getHttpServer())
        .post('/api/v1/pickup-requests')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          quoteId: quote.id,
          dropAtWarehouse: false,
          pickupContactName: 'Jane Doe',
          pickupContactPhone: '+919876500099',
          pickupAddressLine1: '789 Pickup Lane',
          pickupCity: 'Hyderabad',
          pickupState: 'TG',
          pickupPostalCode: '500001',
          pickupDate: pickupDateInWindow(),
          pickupTimeSlot: '09:00-12:00',
        })
        .expect(201);
      const pickupRequest = createPrRes.body as PickupRequestDto;
      // Auto-assigned to an active Pickup Partner at creation (single-partner operation, see
      // PickupRequestsService.create) — this file's own beforeAll guarantees at least one active
      // PICKUP_PARTNER (partnerId/otherPartnerId) exists by the time this runs.
      expect(pickupRequest.status).toBe('ASSIGNED');
      expect(pickupRequest.assignedPartnerId).toBeTruthy();
      expect(pickupRequest.rateProviderName).toBe(
        'E2E Pickup Request Test Provider',
      );
      expect(pickupRequest.estimatedPrice).toBe(808);

      const customerViewRes = await request(app.getHttpServer())
        .get('/api/v1/pickup-requests/me')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .expect(200);
      expect(
        (customerViewRes.body as PickupRequestDto[]).some(
          (p) => p.id === pickupRequest.id,
        ),
      ).toBe(true);

      // Admin assigns a Pickup Partner.
      const assignRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/pickup-requests/${pickupRequest.id}/assign`)
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({ partnerId })
        .expect(200);
      expect((assignRes.body as PickupRequestDto).status).toBe('ASSIGNED');
      expect((assignRes.body as PickupRequestDto).assignedPartnerId).toBe(
        partnerId,
      );

      // A different partner cannot see or act on a pickup assigned to someone else.
      await request(app.getHttpServer())
        .get(`/api/v1/partner/pickup-requests/${pickupRequest.id}`)
        .set('Authorization', `Bearer ${otherPartnerAccessToken}`)
        .expect(404);

      const partnerListRes = await request(app.getHttpServer())
        .get('/api/v1/partner/pickup-requests')
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .expect(200);
      expect(
        (partnerListRes.body as PickupRequestDto[]).some(
          (p) => p.id === pickupRequest.id,
        ),
      ).toBe(true);

      // Step 1 of the mobile workflow — partner confirms arrival before touching weight/price.
      const arriveRes = await request(app.getHttpServer())
        .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/arrive`)
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .expect(200);
      const arrived = arriveRes.body as PickupRequestDto;
      expect(arrived.status).toBe('OUT_FOR_PICKUP');
      expect(arrived.arrivedAt).toBeTruthy();

      // A retry (double-tap / network retry) is idempotent — same timestamp, no duplicate audit
      // row, no error.
      const arriveAgainRes = await request(app.getHttpServer())
        .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/arrive`)
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .expect(200);
      expect((arriveAgainRes.body as PickupRequestDto).arrivedAt).toBe(
        arrived.arrivedAt,
      );
      const arrivalLogs = await prisma.auditLog.findMany({
        where: {
          entity: 'PickupRequest',
          entityId: pickupRequest.id,
          action: 'PICKUP_REQUEST_ARRIVED',
        },
      });
      expect(arrivalLogs).toHaveLength(1);

      // Partner corrects the weight (5kg -> 6kg) and previews the recalculated price before
      // committing — nothing persisted yet.
      const recalcRes = await request(app.getHttpServer())
        .post(`/api/v1/partner/pickup-requests/${pickupRequest.id}/recalculate`)
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .send({ weightKg: 6, shipmentType: 'PARCEL' })
        .expect(201);
      expect(recalcRes.body).toMatchObject({ estimatedPrice: 808 });
      expect(
        (recalcRes.body as { recalculatedPrice: number }).recalculatedPrice,
      ).toBeGreaterThan(808);

      const stillPending = await prisma.pickupRequest.findUnique({
        where: { id: pickupRequest.id },
      });
      expect(stillPending!.verifiedAt).toBeNull();

      // Persist the verification — the server re-runs the pricing engine itself.
      const verifyRes = await request(app.getHttpServer())
        .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/verify`)
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .send({
          verifiedWeightKg: 6,
          verifiedShipmentType: 'PARCEL',
          verificationNotes: 'Heavier than quoted',
        })
        .expect(200);
      const verified = verifyRes.body as PickupRequestDto;
      expect(verified.status).toBe('VERIFICATION_PENDING');
      expect(verified.verifiedWeightKg).toBe(6);
      expect(verified.verifiedPrice).toBeGreaterThan(808);

      // Collecting payment before verification is rejected elsewhere (unit-tested); here just
      // confirm the happy path persists it.
      const payRes = await request(app.getHttpServer())
        .patch(
          `/api/v1/partner/pickup-requests/${pickupRequest.id}/collect-payment`,
        )
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .send({
          paymentMethod: 'UPI',
          collectedAmount: verified.verifiedPrice,
          paymentReference: 'UPI-REF-1',
        })
        .expect(200);
      expect((payRes.body as PickupRequestDto).paymentMethod).toBe('UPI');
      expect((payRes.body as PickupRequestDto).collectedAmount).toBe(
        verified.verifiedPrice,
      );

      // Accept the parcel — this is the only place an Order/Shipment is ever created for this
      // flow (Section: Order creation sequence).
      const acceptRes = await request(app.getHttpServer())
        .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/accept`)
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .send({
          parcelPackedProperly: true,
          weightVerifiedFlag: true,
          restrictedItemsChecked: true,
          documentsVerified: true,
          isFragile: false,
          insuranceRequired: false,
          acceptanceRemarks: 'All good',
        })
        .expect(200);
      const completed = acceptRes.body as PickupRequestDto;
      expect(completed.status).toBe('COMPLETED');
      expect(completed.orderId).toBeTruthy();

      const order = await prisma.order.findUnique({
        where: { id: completed.orderId! },
        include: { shipments: true },
      });
      expect(order).not.toBeNull();
      expect(order!.paymentStatus).toBe('PAID');
      expect(order!.shipments).toHaveLength(1);
      expect(order!.shipments[0].internalTrackingNumber).toMatch(
        /^NW-\d{2}-\d{8}$/,
      );

      const updatedQuote = await prisma.quote.findUnique({
        where: { id: quote.id },
      });
      expect(updatedQuote!.status).toBe('ACCEPTED');
      expect(updatedQuote!.orderId).toBe(completed.orderId);

      // Visible in the existing admin orders surface — no separate code path was needed there.
      const adminOrdersRes = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(200);
      expect(
        (adminOrdersRes.body as { id: string }[]).some(
          (o) => o.id === completed.orderId,
        ),
      ).toBe(true);

      // Once COMPLETED, no further transitions are allowed.
      await request(app.getHttpServer())
        .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/verify`)
        .set('Authorization', `Bearer ${partnerAccessToken}`)
        .send({ verifiedWeightKg: 7, verifiedShipmentType: 'PARCEL' })
        .expect(400);
    },
  );

  it('verify() is rejected until the partner has marked arrival', async () => {
    const quote = await createRatedQuote('e2e-pr-arrival-gate');
    const option = quote.rateQuoteOptions[0];
    await request(app.getHttpServer())
      .post(`/api/v1/quotes/${quote.id}/select-option`)
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({ optionId: option.id })
      .expect(201);
    const createPrRes = await request(app.getHttpServer())
      .post('/api/v1/pickup-requests')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        quoteId: quote.id,
        dropAtWarehouse: true,
        pickupContactName: 'Jane Doe',
        pickupContactPhone: '+919876500099',
        pickupAddressLine1: '789 Pickup Lane',
        pickupCity: 'Hyderabad',
        pickupState: 'TG',
        pickupPostalCode: '500001',
      })
      .expect(201);
    const pickupRequest = createPrRes.body as PickupRequestDto;
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickup-requests/${pickupRequest.id}/assign`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ partnerId })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/verify`)
      .set('Authorization', `Bearer ${partnerAccessToken}`)
      .send({ verifiedWeightKg: 5, verifiedShipmentType: 'PARCEL' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/arrive`)
      .set('Authorization', `Bearer ${partnerAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/verify`)
      .set('Authorization', `Bearer ${partnerAccessToken}`)
      .send({ verifiedWeightKg: 5, verifiedShipmentType: 'PARCEL' })
      .expect(200);
  });

  it('reject flow: partner rejects the parcel, quote and pickup request both end REJECTED, no Order is created', async () => {
    const quote = await createRatedQuote('e2e-pr-reject-flow');
    const option = quote.rateQuoteOptions[0];

    await request(app.getHttpServer())
      .post(`/api/v1/quotes/${quote.id}/select-option`)
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({ optionId: option.id })
      .expect(201);

    const createPrRes = await request(app.getHttpServer())
      .post('/api/v1/pickup-requests')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        quoteId: quote.id,
        dropAtWarehouse: true,
        pickupContactName: 'Jane Doe',
        pickupContactPhone: '+919876500099',
        pickupAddressLine1: '789 Pickup Lane',
        pickupCity: 'Hyderabad',
        pickupState: 'TG',
        pickupPostalCode: '500001',
      })
      .expect(201);
    const pickupRequest = createPrRes.body as PickupRequestDto;
    expect(pickupRequest.dropAtWarehouse).toBe(true);
    expect(pickupRequest.pickupDate).toBeNull();

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/pickup-requests/${pickupRequest.id}/assign`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ partnerId })
      .expect(200);

    const rejectRes = await request(app.getHttpServer())
      .patch(`/api/v1/partner/pickup-requests/${pickupRequest.id}/reject`)
      .set('Authorization', `Bearer ${partnerAccessToken}`)
      .send({ reason: 'Restricted item found inside the parcel' })
      .expect(200);
    const rejected = rejectRes.body as PickupRequestDto;
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe(
      'Restricted item found inside the parcel',
    );
    expect(rejected.orderId).toBeNull();

    const updatedQuote = await prisma.quote.findUnique({
      where: { id: quote.id },
    });
    expect(updatedQuote!.status).toBe('REJECTED');
    expect(updatedQuote!.orderId).toBeNull();
  });

  it("the Pickup Partner dashboard summary reflects today's assigned pickups and collections", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/pickup-requests/dashboard-summary')
      .set('Authorization', `Bearer ${partnerAccessToken}`)
      .expect(200);
    const summary = res.body as PickupPartnerDashboardSummaryDto;
    expect(typeof summary.todayPickups).toBe('number');
    expect(typeof summary.tomorrowPickups).toBe('number');
    expect(typeof summary.pendingPickups).toBe('number');
    expect(typeof summary.completedToday).toBe('number');
    expect(typeof summary.collectionsToday).toBe('number');
    expect(typeof summary.cashCollectedToday).toBe('number');
    expect(typeof summary.upiCollectedToday).toBe('number');
    expect(typeof summary.totalStops).toBe('number');
  });
});
