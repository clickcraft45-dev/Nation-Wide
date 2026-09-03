import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  CountryDto,
  RateDto,
  RateProviderDto,
  ZoneDto,
} from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const TEST_ADMIN_EMAIL = 'e2e-pricing-admin@nationwide.dev';
const TEST_STAFF_EMAIL = 'e2e-pricing-staff@nationwide.dev';
const TEST_PASSWORD = 'CorrectHorseBattery1';
const TEST_PROVIDER_CODE = 'E2E_PRICING_PROVIDER';
// A real ISO 3166-1 alpha-2 shape (letters only) is now enforced by CreateCountryDto (VAL-2) —
// this fake test code has to match that shape too, not just be a unique 2-char string.
const TEST_COUNTRY_CODE = 'ZQ';

describe('Pricing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let adminAccessToken: string;
  let staffAccessToken: string;
  let adminId: string;
  let staffId: string;
  let rateProviderId: string;
  let countryId: string;
  let zoneId: string;

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

    const admin = await prisma.adminUser.upsert({
      where: { email: TEST_ADMIN_EMAIL },
      update: {},
      create: {
        email: TEST_ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        role: 'ADMIN',
      },
    });
    adminId = admin.id;
    adminAccessToken = await signToken(admin.id, admin.email, 'ADMIN');

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
  });

  afterAll(async () => {
    // Scoped by rateProviderId (rather than tracking individual rate/card/zone ids inline) so it
    // also sweeps up anything left behind by an earlier interrupted run — same convention as
    // quotes.e2e-spec.ts's afterAll.
    const zones = rateProviderId
      ? await prisma.zone.findMany({ where: { rateProviderId } })
      : [];
    const zoneIds = zones.map((z) => z.id);
    const cards = zoneIds.length
      ? await prisma.rateCard.findMany({ where: { zoneId: { in: zoneIds } } })
      : [];
    const cardIds = cards.map((c) => c.id);
    await prisma.weightSlab.deleteMany({
      where: { rateCardId: { in: cardIds } },
    });
    await prisma.rateCard.deleteMany({ where: { id: { in: cardIds } } });
    await prisma.zoneCountry.deleteMany({ where: { zoneId: { in: zoneIds } } });
    await prisma.zone.deleteMany({ where: { id: { in: zoneIds } } });
    if (rateProviderId) {
      await prisma.rateProvider.deleteMany({ where: { id: rateProviderId } });
    }
    if (countryId) {
      await prisma.country.deleteMany({ where: { id: countryId } });
    }
    // Catch-all by actor — must go before the AdminUser delete below (audit_logs.actor_id FK).
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [adminId, staffId] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: { in: [TEST_ADMIN_EMAIL, TEST_STAFF_EMAIL] } },
    });
    await app.close();
  });

  describe('RBAC — ADMIN only, STAFF forbidden', () => {
    it('rejects STAFF on every admin pricing route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/rate-providers')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/admin/rate-providers')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({ code: 'NOPE', name: 'Nope' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/countries')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/admin/countries')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({ code: 'NP', name: 'Nopeland' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/zones')
        .query({ rateProviderId: 'some-id' })
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/admin/zones')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({ rateProviderId: 'some-id', name: 'Zone A' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({
          zoneId: 'some-id',
          shipmentType: 'PACKAGE',
          weightFromKg: 0,
          weightToKg: 1,
          baseRate: 100,
        })
        .expect(403);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/rate-providers')
        .expect(401);
    });
  });

  describe('full admin flow', () => {
    it('creates a provider, a country, a zone, and a rate — the rate is live immediately, no activation step', async () => {
      const providerRes = await request(app.getHttpServer())
        .post('/api/v1/admin/rate-providers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ code: TEST_PROVIDER_CODE, name: 'E2E Pricing Provider' })
        .expect(201);
      const provider = providerRes.body as RateProviderDto;
      expect(provider.code).toBe(TEST_PROVIDER_CODE);
      expect(provider.isActive).toBe(true);
      rateProviderId = provider.id;

      const countryRes = await request(app.getHttpServer())
        .post('/api/v1/admin/countries')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ code: TEST_COUNTRY_CODE, name: 'E2E Pricing Country' })
        .expect(201);
      const country = countryRes.body as CountryDto;
      expect(country.code).toBe(TEST_COUNTRY_CODE);
      countryId = country.id;

      const zoneRes = await request(app.getHttpServer())
        .post('/api/v1/admin/zones')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ rateProviderId, name: 'Zone A' })
        .expect(201);
      const zone = zoneRes.body as ZoneDto;
      expect(zone.rateProviderId).toBe(rateProviderId);
      expect(zone.countryCount).toBe(0);
      zoneId = zone.id;

      await request(app.getHttpServer())
        .post(`/api/v1/admin/zones/${zoneId}/countries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ countryId })
        .expect(204);

      const zoneCountriesRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/zones/${zoneId}/countries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (zoneCountriesRes.body as { countryId: string }[]).some(
          (c) => c.countryId === countryId,
        ),
      ).toBe(true);

      const rateRes = await request(app.getHttpServer())
        .post('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          zoneId,
          shipmentType: 'PACKAGE',
          weightFromKg: 0,
          weightToKg: 10,
          baseRate: 500,
          gstPercent: 18,
          nationwideCut: 100,
        })
        .expect(201);
      const rate = rateRes.body as RateDto;
      expect(rate.isActive).toBe(true);
      expect(rate.rateProviderName).toBe('E2E Pricing Provider');
      expect(rate.zoneName).toBe('Zone A');
      expect(rate.shipmentType).toBe('PACKAGE');

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect((listRes.body as RateDto[]).some((r) => r.id === rate.id)).toBe(
        true,
      );

      const publicCountriesRes = await request(app.getHttpServer())
        .get('/api/v1/countries')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(200);
      expect(
        (publicCountriesRes.body as CountryDto[]).some(
          (c) => c.id === countryId,
        ),
      ).toBe(true);
    });

    it('updates provider-level Fuel Charge % and PSS/kg once, and records it in the audit trail', async () => {
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/rate-providers/${rateProviderId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ fuelChargePercent: 18, pssPerKg: 100 })
        .expect(200);
      const updated = patchRes.body as RateProviderDto;
      expect(updated.fuelChargePercent).toBe(18);
      expect(updated.pssPerKg).toBe(100);

      const historyRes = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/audit-logs?entity=RateProvider&entityId=${rateProviderId}`,
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (historyRes.body as { action: string }[]).some(
          (e) => e.action === 'PROVIDER_CONFIG_UPDATED',
        ),
      ).toBe(true);
    });

    it('rejects a new rate whose range overlaps an existing active rate for the same zone+type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          zoneId,
          shipmentType: 'PACKAGE',
          weightFromKg: 5,
          weightToKg: 15,
          baseRate: 600,
        })
        .expect(400);
    });

    it('does not treat a different shipment type in the same zone as overlapping', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          zoneId,
          shipmentType: 'DOCUMENT',
          weightFromKg: 0,
          weightToKg: 10,
          baseRate: 300,
        })
        .expect(201);
    });

    it('rejects an exact-duplicate rate with a 409 and an "update instead" body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          zoneId,
          shipmentType: 'PACKAGE',
          weightFromKg: 0,
          weightToKg: 10,
          baseRate: 999,
        })
        .expect(409);
      expect(res.body).toMatchObject({
        message: 'duplicate_rate',
        rateProviderName: 'E2E Pricing Provider',
        zoneName: 'Zone A',
        shipmentType: 'PACKAGE',
        weightFromKg: 0,
        weightToKg: 10,
      });

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/rates/${res.body.existingRateId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ baseRate: 999 })
        .expect(200);
      expect((updateRes.body as RateDto).baseRate).toBe(999);

      const historyRes = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/audit-logs?entity=WeightSlab&entityId=${res.body.existingRateId}`,
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (historyRes.body as { action: string }[]).some(
          (e) => e.action === 'RATE_UPDATED',
        ),
      ).toBe(true);
    });

    it('deactivates and reactivates a rate via PATCH /:id/active', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/admin/rates')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ zoneId, shipmentType: 'PACKAGE' })
        .expect(200);
      const rate = (listRes.body as RateDto[])[0];

      const deactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/rates/${rate.id}/active`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: false })
        .expect(200);
      expect((deactivateRes.body as RateDto).isActive).toBe(false);

      const reactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/rates/${rate.id}/active`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: true })
        .expect(200);
      expect((reactivateRes.body as RateDto).isActive).toBe(true);
    });

    it('reassigning a country to a second zone moves it atomically (one zone per country per provider)', async () => {
      const secondZoneRes = await request(app.getHttpServer())
        .post('/api/v1/admin/zones')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ rateProviderId, name: 'Zone B' })
        .expect(201);
      const secondZone = secondZoneRes.body as ZoneDto;

      await request(app.getHttpServer())
        .post(`/api/v1/admin/zones/${secondZone.id}/countries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ countryId })
        .expect(204);

      const firstZoneCountriesRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/zones/${zoneId}/countries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (firstZoneCountriesRes.body as { countryId: string }[]).some(
          (c) => c.countryId === countryId,
        ),
      ).toBe(false);

      const secondZoneCountriesRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/zones/${secondZone.id}/countries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (secondZoneCountriesRes.body as { countryId: string }[]).some(
          (c) => c.countryId === countryId,
        ),
      ).toBe(true);

      // Move it back so the rest of the test file's assumptions (country belongs to `zoneId`)
      // still hold for any test that runs after this one.
      await request(app.getHttpServer())
        .post(`/api/v1/admin/zones/${zoneId}/countries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ countryId })
        .expect(204);
    });
  });

  describe('provider -> country drill-down and dashboard aggregation (pricing redesign)', () => {
    it('rejects STAFF on every new pricing admin route', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/admin/rate-providers/${rateProviderId}`)
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/admin/rate-providers/${rateProviderId}/countries`)
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `/api/v1/admin/rate-providers/${rateProviderId}/countries/${countryId}`,
        )
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `/api/v1/admin/rate-providers/${rateProviderId}/countries/${countryId}/rates`,
        )
        .query({ shipmentType: 'PACKAGE' })
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/admin/rates/preview')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({ rateProviderId, weightKg: 2, baseRate: 100 })
        .expect(403);

      await request(app.getHttpServer())
        .patch('/api/v1/admin/rates/bulk')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .send({ updates: [] })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/pricing/dashboard-summary')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/pricing/search')
        .query({ q: 'e2e' })
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);
    });

    it('GET /admin/rate-providers/:id returns the provider with its active country count', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/rate-providers/${rateProviderId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const provider = res.body as RateProviderDto;
      expect(provider.id).toBe(rateProviderId);
      expect(provider.activeCountryCount).toBe(1);
    });

    it('GET /admin/rate-providers/:id/countries lists the configured country with a rollup', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/rate-providers/${rateProviderId}/countries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const countries = res.body as {
        countryId: string;
        zoneId: string;
        weightSlabCount: number;
        availableShipmentTypes: string[];
      }[];
      const entry = countries.find((c) => c.countryId === countryId);
      expect(entry).toBeDefined();
      expect(entry?.zoneId).toBe(zoneId);
      expect(entry?.weightSlabCount).toBe(2); // PACKAGE + DOCUMENT rates from earlier tests
      expect(entry?.availableShipmentTypes.sort()).toEqual([
        'DOCUMENT',
        'PACKAGE',
      ]);
    });

    it('GET /admin/rate-providers/:id/countries/:countryId reports per-shipment-type status', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/rate-providers/${rateProviderId}/countries/${countryId}`,
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const detail = res.body as {
        zoneId: string;
        services: { shipmentType: string; weightSlabCount: number }[];
      };
      expect(detail.zoneId).toBe(zoneId);
      expect(
        detail.services.find((s) => s.shipmentType === 'PACKAGE')
          ?.weightSlabCount,
      ).toBe(1);
      expect(
        detail.services.find((s) => s.shipmentType === 'DOCUMENT')
          ?.weightSlabCount,
      ).toBe(1);
      expect(
        detail.services.find((s) => s.shipmentType === 'PARCEL')
          ?.weightSlabCount,
      ).toBe(0);
    });

    it('404s for a country not configured under the provider', async () => {
      const otherCountryRes = await request(app.getHttpServer())
        .post('/api/v1/admin/countries')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ code: 'ZZ', name: 'E2E Pricing Unrelated Country' })
        .expect(201);
      const otherCountry = otherCountryRes.body as CountryDto;

      await request(app.getHttpServer())
        .get(
          `/api/v1/admin/rate-providers/${rateProviderId}/countries/${otherCountry.id}`,
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      await prisma.country.delete({ where: { id: otherCountry.id } });
    });

    let packageRateId: string;

    it('GET .../rates?shipmentType=PACKAGE resolves the zone internally and returns the rate', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/rate-providers/${rateProviderId}/countries/${countryId}/rates`,
        )
        .query({ shipmentType: 'PACKAGE' })
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const rates = res.body as RateDto[];
      expect(rates).toHaveLength(1);
      expect(rates[0].zoneId).toBe(zoneId);
      expect(rates[0].shipmentType).toBe('PACKAGE');
      packageRateId = rates[0].id;
    });

    it('POST /admin/rates/preview reuses the live 7-step calculation without persisting anything', async () => {
      // Provider was set to fuelChargePercent: 18, pssPerKg: 100 earlier in this file.
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/rates/preview')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          rateProviderId,
          weightKg: 2,
          baseRate: 500,
          gstPercent: 18,
          nationwideCut: 100,
        })
        .expect(201);

      const pssAmount = 100 * 2; // pssPerKg * weightKg
      const fuelChargeAmount = 500 * 0.18; // baseRate * fuelChargePercent
      const taxableSubtotal = 500 + pssAmount + fuelChargeAmount;
      const gstAmount = taxableSubtotal * 0.18;
      const finalPrice = taxableSubtotal + gstAmount + 100;

      expect(res.body).toMatchObject({
        rateProviderId,
        baseRate: 500,
        pssAmount,
        fuelChargeAmount,
        taxableSubtotal,
        gstAmount,
        nationwideCut: 100,
        finalPrice,
      });
    });

    it('PATCH /admin/rates/bulk updates values only, transactionally, with one audit row per rate', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/rates/bulk')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          updates: [
            {
              id: packageRateId,
              baseRate: 555,
              gstPercent: 18,
              nationwideCut: 100,
            },
          ],
          reason: 'e2e bulk edit test',
        })
        .expect(200);
      const updated = res.body as RateDto[];
      expect(updated[0].baseRate).toBe(555);

      const historyRes = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/audit-logs?entity=WeightSlab&entityId=${packageRateId}`,
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const history = historyRes.body as {
        action: string;
        reason: string | null;
        rateProviderName: string | null;
        zoneName: string | null;
      }[];
      const bulkEntry = history.find((e) => e.reason === 'e2e bulk edit test');
      expect(bulkEntry).toBeDefined();
      expect(bulkEntry?.action).toBe('RATE_UPDATED');
      expect(bulkEntry?.rateProviderName).toBe('E2E Pricing Provider');
      expect(bulkEntry?.zoneName).toBe('Zone A');
    });

    it('PATCH /admin/rates/bulk rolls back the whole transaction if any row fails', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/rates/bulk')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          updates: [
            { id: packageRateId, baseRate: 777 },
            { id: '00000000-0000-0000-0000-000000000000', baseRate: 1 },
          ],
        })
        .expect(404);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/rates/${packageRateId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      // Still 555 from the previous test, not 777 — the failed second row rolled back the first.
      expect((res.body as RateDto).baseRate).toBe(555);
    });

    it('GET /admin/pricing/dashboard-summary reports global counts including the test data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/pricing/dashboard-summary')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        totalProviders: expect.any(Number),
        activeCountries: expect.any(Number),
        totalZones: expect.any(Number),
        totalRateCards: expect.any(Number),
        pendingChangesCount: expect.any(Number),
      });
      expect(res.body.totalProviders).toBeGreaterThanOrEqual(1);
      expect(res.body.totalRateCards).toBeGreaterThanOrEqual(2);
    });

    it('GET /admin/pricing/search finds the provider/country pair by either name', async () => {
      const byProvider = await request(app.getHttpServer())
        .get('/api/v1/admin/pricing/search')
        .query({ q: 'E2E Pricing Provider' })
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (byProvider.body as { countryId: string }[]).some(
          (r) => r.countryId === countryId,
        ),
      ).toBe(true);

      const byCountry = await request(app.getHttpServer())
        .get('/api/v1/admin/pricing/search')
        .query({ q: 'E2E Pricing Country' })
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (byCountry.body as { rateProviderId: string }[]).some(
          (r) => r.rateProviderId === rateProviderId,
        ),
      ).toBe(true);
    });
  });
});
