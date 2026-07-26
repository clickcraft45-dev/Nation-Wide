import { Prisma } from '@prisma/client';
import { PricingEngineService } from './pricing-engine.service';

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

function makeSlab(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slab-1',
    weightFromKg: decimal(2),
    weightToKg: decimal(2),
    baseRate: decimal(500),
    pssAmount: decimal(50),
    fuelChargePercent: decimal(10),
    gstPercent: decimal(18),
    nationwideCut: decimal(100),
    isActive: true,
    ...overrides,
  };
}

function makeZoneCountry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zc-1',
    zoneId: 'zone-1',
    countryId: 'country-1',
    rateProviderId: 'provider-1',
    ...overrides,
  };
}

function makeRateCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    zoneId: 'zone-1',
    shipmentType: 'PACKAGE',
    currency: 'INR',
    zone: {
      id: 'zone-1',
      rateProviderId: 'provider-1',
      name: 'Zone A',
      rateProvider: { id: 'provider-1', name: 'Test Provider' },
    },
    weightSlabs: [makeSlab()],
    ...overrides,
  };
}

describe('PricingEngineService', () => {
  let prisma: {
    zoneCountry: { findMany: jest.Mock };
    rateCard: { findMany: jest.Mock };
  };
  let service: PricingEngineService;

  beforeEach(() => {
    prisma = {
      zoneCountry: {
        findMany: jest.fn().mockResolvedValue([makeZoneCountry()]),
      },
      rateCard: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PricingEngineService(prisma as never);
  });

  it("computes the exact 7-step calculation against the business spec's worked example", async () => {
    prisma.rateCard.findMany.mockResolvedValue([makeRateCard()]);

    const [option] = await service.computeQuotesForRequest({
      destinationCountryName: 'USA',
      weightKg: 2,
      shipmentType: 'PACKAGE',
    });

    // Base 500, PSS 50, Fuel 10% of 500 = 50, taxable subtotal 600, GST 18% of 600 = 108,
    // subtotal-after-GST 708, + NationWide Cut 100 = 808 — matches the spec's own example.
    expect(option.baseRate).toBe(500);
    expect(option.pssAmount).toBe(50);
    expect(option.fuelChargeAmount).toBe(50);
    expect(option.taxableSubtotal).toBe(600);
    expect(option.gstAmount).toBe(108);
    expect(option.nationwideCut).toBe(100);
    expect(option.finalPrice).toBe(808);
  });

  it('never computes fuel charge or GST on NationWide Cut', async () => {
    prisma.rateCard.findMany.mockResolvedValue([
      makeRateCard({
        weightSlabs: [makeSlab({ nationwideCut: decimal(1000) })],
      }),
    ]);

    const [option] = await service.computeQuotesForRequest({
      destinationCountryName: 'USA',
      weightKg: 2,
      shipmentType: 'PACKAGE',
    });

    // Doubling nationwideCut must not move fuelChargeAmount or gstAmount at all.
    expect(option.fuelChargeAmount).toBe(50);
    expect(option.gstAmount).toBe(108);
    expect(option.finalPrice).toBe(1708);
  });

  it('returns one option per eligible provider, each priced from its own zone', async () => {
    prisma.zoneCountry.findMany.mockResolvedValue([
      makeZoneCountry({
        id: 'zc-1',
        zoneId: 'zone-fedex',
        rateProviderId: 'fedex',
      }),
      makeZoneCountry({
        id: 'zc-2',
        zoneId: 'zone-ups',
        rateProviderId: 'ups',
      }),
    ]);
    prisma.rateCard.findMany.mockResolvedValue([
      makeRateCard({
        id: 'card-1',
        zoneId: 'zone-fedex',
        zone: {
          id: 'zone-fedex',
          rateProviderId: 'fedex',
          name: 'Zone A',
          rateProvider: { id: 'fedex', name: 'FedEx' },
        },
      }),
      makeRateCard({
        id: 'card-2',
        zoneId: 'zone-ups',
        zone: {
          id: 'zone-ups',
          rateProviderId: 'ups',
          name: 'Zone 1',
          rateProvider: { id: 'ups', name: 'UPS' },
        },
      }),
    ]);

    const options = await service.computeQuotesForRequest({
      destinationCountryName: 'USA',
      weightKg: 2,
      shipmentType: 'PACKAGE',
    });

    expect(options).toHaveLength(2);
    expect(options.map((o) => o.rateProviderId).sort()).toEqual([
      'fedex',
      'ups',
    ]);
  });

  // Locks in the fix for a wrong-provider-attribution bug a prior review caught: RateCard has no
  // rateProviderId of its own (removed specifically to make this impossible), so the option's
  // provider must always come from the returned card's OWN zone relation — never from whichever
  // zoneCountry row happened to be used to build the `zoneId IN (...)` filter.
  it("attributes each option to the provider of the rate card's own zone, not the query filter", async () => {
    prisma.zoneCountry.findMany.mockResolvedValue([
      makeZoneCountry({ zoneId: 'zone-1', rateProviderId: 'fedex' }),
    ]);
    prisma.rateCard.findMany.mockResolvedValue([
      makeRateCard({
        zoneId: 'zone-1',
        zone: {
          id: 'zone-1',
          rateProviderId: 'ups',
          name: 'Zone 1',
          rateProvider: { id: 'ups', name: 'UPS' },
        },
      }),
    ]);

    const [option] = await service.computeQuotesForRequest({
      destinationCountryName: 'USA',
      weightKg: 2,
      shipmentType: 'PACKAGE',
    });

    expect(option.rateProviderId).toBe('ups');
    expect(option.rateProviderName).toBe('UPS');
  });

  it('excludes a rate card whose weight slabs have a gap at the requested weight', async () => {
    prisma.rateCard.findMany.mockResolvedValue([
      makeRateCard({
        weightSlabs: [
          makeSlab({ weightFromKg: decimal(20), weightToKg: decimal(40) }),
        ],
      }),
    ]);

    const options = await service.computeQuotesForRequest({
      destinationCountryName: 'USA',
      weightKg: 5,
      shipmentType: 'PACKAGE',
    });

    expect(options).toHaveLength(0);
  });

  it('returns an empty array without querying rate cards when the country has no zone under any provider', async () => {
    prisma.zoneCountry.findMany.mockResolvedValue([]);

    const options = await service.computeQuotesForRequest({
      destinationCountryName: 'Nowhereland',
      weightKg: 2,
      shipmentType: 'PACKAGE',
    });

    expect(options).toEqual([]);
    expect(prisma.rateCard.findMany).not.toHaveBeenCalled();
  });

  it('matches the requested weight to the correct slab among several on one rate card', async () => {
    prisma.rateCard.findMany.mockResolvedValue([
      makeRateCard({
        weightSlabs: [
          makeSlab({
            id: 'slab-a',
            weightFromKg: decimal(0.5),
            weightToKg: decimal(1),
            baseRate: decimal(200),
          }),
          makeSlab({
            id: 'slab-b',
            weightFromKg: decimal(1.01),
            weightToKg: decimal(2),
            baseRate: decimal(500),
          }),
        ],
      }),
    ]);

    const [option] = await service.computeQuotesForRequest({
      destinationCountryName: 'USA',
      weightKg: 1.5,
      shipmentType: 'PACKAGE',
    });

    expect(option.weightSlabId).toBe('slab-b');
    expect(option.baseRate).toBe(500);
  });

  it('queries zone membership for an active, matching country and active providers, then rate cards for the exact zones and shipment type', async () => {
    prisma.rateCard.findMany.mockResolvedValue([makeRateCard()]);

    await service.computeQuotesForRequest({
      destinationCountryName: 'USA',
      weightKg: 2,
      shipmentType: 'DOCUMENT',
    });

    expect(prisma.zoneCountry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          country: expect.objectContaining({
            isActive: true,
            name: { equals: 'USA', mode: 'insensitive' },
          }),
          rateProvider: { isActive: true },
        }),
      }),
    );
    expect(prisma.rateCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shipmentType: 'DOCUMENT',
          zoneId: { in: ['zone-1'] },
          weightSlabs: { some: { isActive: true } },
        }),
      }),
    );
  });
});
