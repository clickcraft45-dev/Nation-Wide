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
import { RatesService } from '../src/modules/pricing/rates.service';

const TEST_STAFF_EMAIL = 'e2e-quotes-staff@nationwide.dev';
const TEST_STAFF_PASSWORD = 'CorrectHorseBattery1';
const TEST_CUSTOMER_PHONE = '+919876500003';
const TEST_PROVIDER_CODE = 'ICL';
// A dedicated RateProvider so this file's rate-card activation/supersede logic never interacts
// with pricing.e2e-spec.ts's own fixtures — each file owns its (provider, country) pair.
const TEST_RATE_PROVIDER_CODE = 'E2E_QUOTES_PROVIDER';
const TEST_COUNTRY_CODE = 'E3';
const TEST_COUNTRY_NAME = 'E2E Quotes Test Country';
// A destination with no rate card anywhere — proves the NO_RATE_AVAILABLE fallback and the
// pre-existing manual-quote/accept path are both unaffected by the pricing engine's presence.
const NO_RATE_DESTINATION_COUNTRY = 'Freedonia';

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
  country: TEST_COUNTRY_NAME,
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
  let staffId: string;
  let rateProviderId: string;

  async function signToken(
    sub: string,
    email: string,
    role: 'CUSTOMER' | 'STAFF' | 'ADMIN',
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
    staffId = staff.id;
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
    customerAccessToken = await signToken(
      customerId,
      'quote-e2e@example.com',
      'CUSTOMER',
    );

    // Never deleted in afterAll — a shared lookup row, same convention as the ICL
    // ShippingProvider upsert above. Uses a dedicated non-ISO code/name so it can never
    // collide with real seeded country data (e.g. the real 'US' row).
    const country = await prisma.country.upsert({
      where: { code: TEST_COUNTRY_CODE },
      update: {},
      create: { code: TEST_COUNTRY_CODE, name: TEST_COUNTRY_NAME },
    });

    // Fuel Charge % and PSS/kg are provider-level config now — 10% and ₹10/kg here reproduce the
    // same 50/50 PSS/fuel-charge amounts the old per-slab fixture used, for the 5kg PARCEL
    // requests below (weight × ₹10 = ₹50 PSS, matching this file's existing finalPrice: 808).
    const rateProvider = await prisma.rateProvider.upsert({
      where: { code: TEST_RATE_PROVIDER_CODE },
      update: { fuelChargePercent: 10, pssPerKg: 10 },
      create: {
        code: TEST_RATE_PROVIDER_CODE,
        name: 'E2E Quotes Test Provider',
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
    // Only PARCEL needs a real rate — every test exercising the pricing engine submits PARCEL;
    // the OTHER/DOCUMENT-typed requests below never reach it (OTHER short-circuits, and the
    // duplicate-submissionKey test only checks dedup behavior, not pricing).
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
    // RateQuoteOption rows must go first — Quote.selectedOptionId, WeightSlab, and RateCard/
    // RateProvider deletion are all blocked (ON DELETE RESTRICT) while they still exist.
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
    // RateCard.createdByAdminId also FKs to AdminUser (ON DELETE RESTRICT) — the card must go
    // before the AdminUser delete below, same reasoning as the audit-log catch-all. Scoped by
    // rateProviderId (not just this run's rateCardId) to also sweep up any orphan left behind
    // by an earlier interrupted run.
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
    await prisma.auditLog.deleteMany({ where: { actorId: staffId } });
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

  it('GET /quotes/preview returns a slim comparison with no internal pricing fields and persists nothing', async () => {
    const beforeCount = await prisma.quote.count();

    const res = await request(app.getHttpServer())
      .get('/api/v1/quotes/preview')
      .query({
        destinationCountry: TEST_COUNTRY_NAME,
        weightKg: 5,
        shipmentType: 'PARCEL',
      })
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(200);

    expect(res.body).toEqual({
      status: 'RATED',
      reviewReason: null,
      options: [
        {
          rateProviderId: rateProviderId,
          rateProviderName: 'E2E Quotes Test Provider',
          currency: 'INR',
          finalPrice: 808,
        },
      ],
    });
    const bodyKeys = Object.keys(res.body.options[0]);
    expect(bodyKeys).not.toContain('baseRate');
    expect(bodyKeys).not.toContain('pssAmount');
    expect(bodyKeys).not.toContain('gstPercent');
    expect(bodyKeys).not.toContain('nationwideCut');

    const afterCount = await prisma.quote.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('GET /quotes/preview returns NEEDS_MANUAL_REVIEW/NO_RATE_AVAILABLE for a destination with no rate', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/quotes/preview')
      .query({
        destinationCountry: NO_RATE_DESTINATION_COUNTRY,
        weightKg: 5,
        shipmentType: 'PARCEL',
      })
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(200);

    expect(res.body).toEqual({
      status: 'NEEDS_MANUAL_REVIEW',
      reviewReason: 'NO_RATE_AVAILABLE',
      options: [],
    });
  });

  it('full flow: submit -> RATED with a real comparison option -> customer selects it -> real Order/Shipment/Pickup exist', async () => {
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
    expect(created.status).toBe('RATED');
    expect(created.customerId).toBe(customerId);
    expect(created.rateQuoteOptions).toHaveLength(1);
    const option = created.rateQuoteOptions[0];
    expect(option.rateProviderName).toBe('E2E Quotes Test Provider');
    // Base 500, PSS 50, Fuel 10% of 500 = 50, taxable subtotal 600, GST 18% of 600 = 108,
    // + NationWide Cut 100 = 808 — matches the same worked example used at the unit level.
    expect(option.finalPrice).toBe(808);

    const mineRes = await request(app.getHttpServer())
      .get('/api/v1/quotes/me')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(200);
    expect((mineRes.body as QuoteDto[]).some((q) => q.id === created.id)).toBe(
      true,
    );

    const adminListRes = await request(app.getHttpServer())
      .get('/api/v1/admin/quotes')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect(
      (adminListRes.body as QuoteAdminDetailDto[]).some(
        (q) => q.id === created.id,
      ),
    ).toBe(true);

    const selectRes = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${created.id}/select-option`)
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({ optionId: option.id })
      .expect(201);
    const accepted = selectRes.body as QuoteDto;
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.orderId).toBeTruthy();
    expect(accepted.quotedAmount).toBe(808);

    const order = await prisma.order.findUnique({
      where: { id: accepted.orderId! },
      include: { shipments: true },
    });
    expect(order).not.toBeNull();
    expect(order!.shipments).toHaveLength(1);
    expect(order!.shipments[0].internalTrackingNumber).toMatch(
      /^NW-\d{2}-\d{8}$/,
    );

    const pickup = await prisma.pickup.findUnique({
      where: { quoteId: created.id },
    });
    expect(pickup).not.toBeNull();
    expect(pickup!.method).toBe('PICKUP');
    expect(pickup!.orderId).toBe(accepted.orderId);

    const adminPickupsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/pickups')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect(
      (adminPickupsRes.body as { id: string }[]).some(
        (p) => p.id === pickup!.id,
      ),
    ).toBe(true);

    const dropOffsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/pickups/drop-offs')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .expect(200);
    expect(
      (dropOffsRes.body as { id: string }[]).some((p) => p.id === pickup!.id),
    ).toBe(false);
  });

  it('flags a normal shipment to a destination with no rate card as NEEDS_MANUAL_REVIEW/NO_RATE_AVAILABLE, and the manual-quote/accept path still works', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        shipmentType: 'PARCEL',
        weightKg: 5,
        origin: baseOrigin,
        destination: {
          ...baseDestination,
          country: NO_RATE_DESTINATION_COUNTRY,
        },
        fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
        submissionKey: 'e2e-key-no-rate',
      })
      .expect(201);
    const created = createRes.body as QuoteDto;
    expect(created.status).toBe('NEEDS_MANUAL_REVIEW');
    expect(created.reviewReason).toBe('NO_RATE_AVAILABLE');
    expect(created.rateQuoteOptions).toHaveLength(0);

    const quotedRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/quotes/${created.id}/manual-quote`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ amount: 1200, currency: 'INR' })
      .expect(201);
    expect((quotedRes.body as QuoteAdminDetailDto).status).toBe('QUOTED');
    expect((quotedRes.body as QuoteAdminDetailDto).quotedAmount).toBe(1200);

    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${created.id}/accept`)
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(201);
    const accepted = acceptRes.body as QuoteDto;
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.orderId).toBeTruthy();
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
    expect(created.rateQuoteOptions).toHaveLength(0);

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

    const count = await prisma.quote.count({
      where: { submissionKey: 'e2e-key-dup' },
    });
    expect(count).toBe(1);
  });
});
