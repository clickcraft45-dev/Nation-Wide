import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  CompanySettingsDto,
  RateCardDocumentDto,
} from '@nationwide/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RatesService } from '../src/modules/pricing/rates.service';

const TEST_ADMIN_EMAIL = 'e2e-ratecards-admin@nationwide.dev';
const TEST_STAFF_EMAIL = 'e2e-ratecards-staff@nationwide.dev';
const TEST_PASSWORD = 'CorrectHorseBattery1';
const TEST_PROVIDER_CODE = 'E2E_RATECARD_PROVIDER';
const TEST_COUNTRY_CODE = 'E4';
const TEST_COUNTRY_NAME = 'E2E Rate Card Test Country';

describe('Rate Cards (e2e)', () => {
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
    role: 'STAFF' | 'ADMIN',
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

    const country = await prisma.country.upsert({
      where: { code: TEST_COUNTRY_CODE },
      update: {},
      create: { code: TEST_COUNTRY_CODE, name: TEST_COUNTRY_NAME },
    });
    countryId = country.id;

    const rateProvider = await prisma.rateProvider.upsert({
      where: { code: TEST_PROVIDER_CODE },
      update: { fuelChargePercent: 10, pssPerKg: 10 },
      create: {
        code: TEST_PROVIDER_CODE,
        name: 'E2E Rate Card Provider',
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
    zoneId = zone.id;
    await prisma.zoneCountry.upsert({
      where: {
        rateProviderId_countryId: {
          rateProviderId: rateProvider.id,
          countryId,
        },
      },
      update: { zoneId: zone.id },
      create: { zoneId: zone.id, countryId, rateProviderId: rateProvider.id },
    });

    const ratesService = app.get(RatesService);
    await ratesService.create(
      {
        zoneId: zone.id,
        shipmentType: 'PACKAGE',
        weightFromKg: 0,
        weightToKg: 5,
        baseRate: 500,
        gstPercent: 18,
        nationwideCut: 100,
      } as never,
      adminId,
    );
  });

  afterAll(async () => {
    await prisma.rateCardDocument.deleteMany({ where: { rateProviderId } });
    const cards = await prisma.rateCard.findMany({ where: { zoneId } });
    await prisma.weightSlab.deleteMany({
      where: { rateCardId: { in: cards.map((c) => c.id) } },
    });
    await prisma.rateCard.deleteMany({ where: { zoneId } });
    await prisma.zoneCountry.deleteMany({ where: { rateProviderId } });
    await prisma.zone.deleteMany({ where: { rateProviderId } });
    await prisma.rateProvider.deleteMany({ where: { id: rateProviderId } });
    await prisma.country.deleteMany({ where: { id: countryId } });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [adminId, staffId] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: { in: [TEST_ADMIN_EMAIL, TEST_STAFF_EMAIL] } },
    });
    await app.close();
  });

  describe('RBAC — ADMIN only, STAFF forbidden', () => {
    it('rejects STAFF on company settings and rate card routes', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/company-settings')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/admin/rate-cards')
        .set('Authorization', `Bearer ${staffAccessToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/company-settings')
        .expect(401);
    });
  });

  describe('company settings', () => {
    it('returns a default singleton row on first read, then persists updates', async () => {
      const initial = await request(app.getHttpServer())
        .get('/api/v1/admin/company-settings')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect((initial.body as CompanySettingsDto).companyName).toBeTruthy();

      const updated = await request(app.getHttpServer())
        .patch('/api/v1/admin/company-settings')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          companyName: 'E2E Test Co',
          primaryColor: '#123456',
          supportEmail: 'help@e2e.test',
        })
        .expect(200);
      const dto = updated.body as CompanySettingsDto;
      expect(dto.companyName).toBe('E2E Test Co');
      expect(dto.primaryColor).toBe('#123456');
      expect(dto.supportEmail).toBe('help@e2e.test');

      const historyRes = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/audit-logs?entity=CompanySettings&entityId=${dto.id}`,
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(
        (historyRes.body as { action: string }[]).some(
          (e) => e.action === 'COMPANY_SETTINGS_UPDATED',
        ),
      ).toBe(true);
    });

    it('uploads a logo and reflects it in the settings response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/company-settings/logo')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('logo', Buffer.from('fake-png-bytes'), 'logo.png')
        .expect(201);
      expect((res.body as CompanySettingsDto).logoUrl).toMatch(
        /^\/uploads\/logos\/.+\.png$/,
      );
    });

    it('rejects a non-image file upload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/company-settings/logo')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('logo', Buffer.from('not an image'), 'notes.txt')
        .expect(400);
    });
  });

  describe('countries lookup', () => {
    it('lists every country mapped to a zone under the given provider', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/rate-cards/countries?rateProviderId=${rateProviderId}`,
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(res.body).toEqual([
        expect.objectContaining({ id: countryId, name: TEST_COUNTRY_NAME }),
      ]);
    });
  });

  describe('rate card generation', () => {
    it('previews a PDF without creating a history entry', async () => {
      const beforeCount = await prisma.rateCardDocument.count({
        where: { rateProviderId },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/rate-cards/preview')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          rateProviderId,
          shipmentType: 'PACKAGE',
          countries: [{ countryId, transitTime: '4-5 Working Days' }],
          effectiveDate: '2026-08-01',
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).length).toBeGreaterThan(0);

      const afterCount = await prisma.rateCardDocument.count({
        where: { rateProviderId },
      });
      expect(afterCount).toBe(beforeCount);
    });

    it(
      'generates and persists a versioned rate card, lists it in history, re-downloads the exact ' +
        'same bytes, and deletes it',
      async () => {
        const generateRes = await request(app.getHttpServer())
          .post('/api/v1/admin/rate-cards')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .send({
            rateProviderId,
            shipmentType: 'PACKAGE',
            countries: [{ countryId }],
            effectiveDate: '2026-08-01',
          })
          .expect(201);
        expect(generateRes.headers['content-type']).toContain(
          'application/pdf',
        );
        const documentId = generateRes.headers['x-rate-card-id'];
        expect(generateRes.headers['x-rate-card-version']).toBe('1');
        expect(documentId).toBeTruthy();

        const historyRes = await request(app.getHttpServer())
          .get(`/api/v1/admin/rate-cards?rateProviderId=${rateProviderId}`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(200);
        const docs = historyRes.body as RateCardDocumentDto[];
        const found = docs.find((d) => d.id === documentId);
        expect(found).toBeDefined();
        expect(found?.version).toBe(1);
        expect(found?.countryNames).toEqual([TEST_COUNTRY_NAME]);
        expect(found?.generatedByAdminEmail).toBe(TEST_ADMIN_EMAIL);

        const downloadRes = await request(app.getHttpServer())
          .get(`/api/v1/admin/rate-cards/${documentId}/download`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(200);
        expect(
          Buffer.compare(
            downloadRes.body as Buffer,
            generateRes.body as Buffer,
          ),
        ).toBe(0);

        // A second generation for the same provider increments the version.
        const secondGenerateRes = await request(app.getHttpServer())
          .post('/api/v1/admin/rate-cards')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .send({
            rateProviderId,
            shipmentType: 'PACKAGE',
            countries: [{ countryId }],
            effectiveDate: '2026-08-15',
          })
          .expect(201);
        expect(secondGenerateRes.headers['x-rate-card-version']).toBe('2');

        await request(app.getHttpServer())
          .delete(`/api/v1/admin/rate-cards/${documentId}`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(204);

        const afterDeleteRes = await request(app.getHttpServer())
          .get(`/api/v1/admin/rate-cards?rateProviderId=${rateProviderId}`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(200);
        expect(
          (afterDeleteRes.body as RateCardDocumentDto[]).some(
            (d) => d.id === documentId,
          ),
        ).toBe(false);
      },
    );

    it('rejects a generation with no countries selected', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/rate-cards')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          rateProviderId,
          shipmentType: 'PACKAGE',
          countries: [],
          effectiveDate: '2026-08-01',
        })
        .expect(400);
    });

    it('rejects a generation with a country that has no zone assignment under this provider', async () => {
      const unmapped = await prisma.country.upsert({
        where: { code: 'E5' },
        update: {},
        create: { code: 'E5', name: 'E2E Unmapped Country' },
      });
      try {
        await request(app.getHttpServer())
          .post('/api/v1/admin/rate-cards')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .send({
            rateProviderId,
            shipmentType: 'PACKAGE',
            countries: [{ countryId: unmapped.id }],
            effectiveDate: '2026-08-01',
          })
          .expect(400);
      } finally {
        await prisma.country.deleteMany({ where: { id: unmapped.id } });
      }
    });
  });
});
