import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RateCardDataService } from './rate-card-data.service';

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

const PROVIDER = { id: 'provider-1', name: 'FedEx' };
const COUNTRY_SETTINGS = {
  id: 'settings-1',
  companyName: 'NationWide',
  tagline: null,
  logoPath: null,
  primaryColor: '#4F46E5',
  website: null,
  supportEmail: null,
  supportPhone: null,
  address: null,
  termsAndConditions: null,
  footerNotes: null,
  insuranceDisclaimer: null,
  legalDisclaimer: null,
  restrictedItemsNotice: null,
  updatedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function zoneCountryMembership(
  zoneId: string,
  country: { id: string; code: string; name: string },
) {
  return {
    zone: { id: zoneId, name: `Zone of ${country.code}` },
    country,
  };
}

describe('RateCardDataService', () => {
  let prisma: {
    rateProvider: { findUnique: jest.Mock };
    zoneCountry: { findUnique: jest.Mock; findMany: jest.Mock };
    rateCard: { findFirst: jest.Mock };
  };
  let pricingEngine: { computeQuotesForRequest: jest.Mock };
  let companySettingsService: { get: jest.Mock };
  let service: RateCardDataService;

  beforeEach(() => {
    prisma = {
      rateProvider: { findUnique: jest.fn().mockResolvedValue(PROVIDER) },
      zoneCountry: { findUnique: jest.fn(), findMany: jest.fn() },
      rateCard: { findFirst: jest.fn() },
    };
    pricingEngine = {
      computeQuotesForRequest: jest.fn().mockResolvedValue([]),
    };
    companySettingsService = {
      get: jest.fn().mockResolvedValue(COUNTRY_SETTINGS),
    };
    service = new RateCardDataService(
      prisma as never,
      pricingEngine as never,
      companySettingsService as never,
    );
  });

  it('throws NotFoundException when the provider does not exist', async () => {
    prisma.rateProvider.findUnique.mockResolvedValue(null);

    await expect(
      service.build({
        rateProviderId: 'missing',
        shipmentType: 'PACKAGE',
        countries: [{ countryId: 'c-usa' }],
        effectiveDate: '2026-08-01',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when no countries are selected', async () => {
    await expect(
      service.build({
        rateProviderId: 'provider-1',
        shipmentType: 'PACKAGE',
        countries: [],
        effectiveDate: '2026-08-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when a selected country has no zone assignment under this provider', async () => {
    prisma.zoneCountry.findUnique.mockResolvedValue(null);

    await expect(
      service.build({
        rateProviderId: 'provider-1',
        shipmentType: 'PACKAGE',
        countries: [{ countryId: 'c-unmapped' }],
        effectiveDate: '2026-08-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolves selected countries in the same zone and builds weight rows from the union of active weight slabs', async () => {
    const usa = { id: 'c-usa', code: 'US', name: 'USA' };
    const can = { id: 'c-can', code: 'CA', name: 'Canada' };
    prisma.zoneCountry.findUnique.mockImplementation(
      ({
        where,
      }: {
        where: { rateProviderId_countryId: { countryId: string } };
      }) => {
        const countryId = where.rateProviderId_countryId.countryId;
        const country = countryId === usa.id ? usa : can;
        return Promise.resolve(zoneCountryMembership('zone-1', country));
      },
    );
    prisma.rateCard.findFirst.mockResolvedValue({
      id: 'card-1',
      weightSlabs: [
        { weightFromKg: decimal(0), weightToKg: decimal(0.5) },
        { weightFromKg: decimal(0.51), weightToKg: decimal(1) },
      ],
    });
    pricingEngine.computeQuotesForRequest.mockResolvedValue([
      { rateProviderId: 'provider-1', finalPrice: 808 },
    ]);

    const data = await service.build({
      rateProviderId: 'provider-1',
      shipmentType: 'PACKAGE',
      countries: [
        { countryId: usa.id, transitTime: '4-5 Working Days' },
        { countryId: can.id },
      ],
      effectiveDate: '2026-08-01',
    });

    expect(data.countries).toEqual([
      {
        id: usa.id,
        code: usa.code,
        name: usa.name,
        transitTime: '4-5 Working Days',
      },
      { id: can.id, code: can.code, name: can.name, transitTime: null },
    ]);
    expect(data.weightRows).toEqual([
      { weightKg: 0.5, label: '0.5 KG', isPerKg: false },
      { weightKg: 1, label: '1 KG', isPerKg: false },
    ]);
    // Same zone → priced once, not once per country (see the perf comment in rate-card-data.service.ts).
    expect(data.prices).toEqual([
      [808, 808],
      [808, 808],
    ]);
    expect(pricingEngine.computeQuotesForRequest).toHaveBeenCalledTimes(2);
  });

  it('computes each distinct zone only once when selected countries span multiple zones, and fills gaps with null', async () => {
    const usa = { id: 'c-usa', code: 'US', name: 'USA' };
    const mex = { id: 'c-mex', code: 'MX', name: 'Mexico' };
    prisma.zoneCountry.findUnique.mockImplementation(
      ({
        where,
      }: {
        where: { rateProviderId_countryId: { countryId: string } };
      }) => {
        const countryId = where.rateProviderId_countryId.countryId;
        if (countryId === usa.id) {
          return Promise.resolve(zoneCountryMembership('zone-1', usa));
        }
        return Promise.resolve(zoneCountryMembership('zone-2', mex));
      },
    );
    prisma.rateCard.findFirst.mockImplementation(
      ({ where }: { where: { zoneId: string } }) => {
        if (where.zoneId === 'zone-1') {
          return Promise.resolve({
            id: 'card-zone-1',
            weightSlabs: [
              { weightFromKg: decimal(0), weightToKg: decimal(0.5) },
            ],
          });
        }
        return Promise.resolve({
          id: 'card-zone-2',
          weightSlabs: [{ weightFromKg: decimal(0), weightToKg: decimal(1) }],
        });
      },
    );
    pricingEngine.computeQuotesForRequest.mockImplementation(
      ({ weightKg }: { weightKg: number }) =>
        Promise.resolve([
          {
            rateProviderId: 'provider-1',
            finalPrice: weightKg === 0.5 ? 500 : 900,
          },
        ]),
    );

    const data = await service.build({
      rateProviderId: 'provider-1',
      shipmentType: 'PACKAGE',
      countries: [{ countryId: usa.id }, { countryId: mex.id }],
      effectiveDate: '2026-08-01',
    });

    // Union of both zones' weight rows, sorted ascending.
    expect(data.weightRows).toEqual([
      { weightKg: 0.5, label: '0.5 KG', isPerKg: false },
      { weightKg: 1, label: '1 KG', isPerKg: false },
    ]);
    // USA (zone-1) has no bracket at 1kg → null, never fabricated. Mexico (zone-2) has no bracket
    // at 0.5kg → null.
    expect(data.prices).toEqual([
      [500, null],
      [null, 900],
    ]);
    // One pricing-engine call per distinct zone's weight row, not per country.
    expect(pricingEngine.computeQuotesForRequest).toHaveBeenCalledTimes(2);
  });

  it('labels the open-ended sentinel weight (999.99kg) as "X KG & Above" and queries the pricing engine at the real lower bound', async () => {
    const usa = { id: 'c-usa', code: 'US', name: 'USA' };
    prisma.zoneCountry.findUnique.mockResolvedValue(
      zoneCountryMembership('zone-1', usa),
    );
    prisma.rateCard.findFirst.mockResolvedValue({
      id: 'card-1',
      weightSlabs: [{ weightFromKg: decimal(71), weightToKg: decimal(999.99) }],
    });
    pricingEngine.computeQuotesForRequest.mockResolvedValue([
      { rateProviderId: 'provider-1', finalPrice: 5000 },
    ]);

    const data = await service.build({
      rateProviderId: 'provider-1',
      shipmentType: 'PACKAGE',
      countries: [{ countryId: usa.id }],
      effectiveDate: '2026-08-01',
    });

    expect(data.weightRows).toEqual([
      { weightKg: 71, label: '71 KG & Above', isPerKg: true },
    ]);
    expect(pricingEngine.computeQuotesForRequest).toHaveBeenCalledWith(
      expect.objectContaining({ weightKg: 71 }),
    );
  });

  it('records a null price (never fabricated) when the pricing engine returns no matching option for a row', async () => {
    const usa = { id: 'c-usa', code: 'US', name: 'USA' };
    prisma.zoneCountry.findUnique.mockResolvedValue(
      zoneCountryMembership('zone-1', usa),
    );
    prisma.rateCard.findFirst.mockResolvedValue({
      id: 'card-1',
      weightSlabs: [{ weightFromKg: decimal(0), weightToKg: decimal(0.5) }],
    });
    pricingEngine.computeQuotesForRequest.mockResolvedValue([]);

    const data = await service.build({
      rateProviderId: 'provider-1',
      shipmentType: 'PACKAGE',
      countries: [{ countryId: usa.id }],
      effectiveDate: '2026-08-01',
    });

    expect(data.prices).toEqual([[null]]);
  });

  it('never includes the provider name or id anywhere but the internal rateProviderId field', async () => {
    const usa = { id: 'c-usa', code: 'US', name: 'USA' };
    prisma.zoneCountry.findUnique.mockResolvedValue(
      zoneCountryMembership('zone-1', usa),
    );
    prisma.rateCard.findFirst.mockResolvedValue({
      id: 'card-1',
      weightSlabs: [],
    });

    const data = await service.build({
      rateProviderId: 'provider-1',
      shipmentType: 'PACKAGE',
      countries: [{ countryId: usa.id }],
      effectiveDate: '2026-08-01',
    });

    expect(data.rateProviderId).toBe('provider-1');
    expect(JSON.stringify(data)).not.toContain('FedEx');
  });

  describe('listCountriesForProvider', () => {
    it('returns every country mapped to any zone under the provider, sorted by name', async () => {
      prisma.zoneCountry.findMany.mockResolvedValue([
        { country: { id: 'c-usa', code: 'US', name: 'USA' } },
        { country: { id: 'c-can', code: 'CA', name: 'Canada' } },
      ]);

      const result = await service.listCountriesForProvider('provider-1');

      expect(result).toEqual([
        { id: 'c-can', code: 'CA', name: 'Canada' },
        { id: 'c-usa', code: 'US', name: 'USA' },
      ]);
    });
  });
});
