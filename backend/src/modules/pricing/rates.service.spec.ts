import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RatesService } from './rates.service';

function decimal(value: number) {
  return value;
}

function makeRate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rate-1',
    rateCardId: 'card-1',
    weightFromKg: decimal(2),
    weightToKg: decimal(2),
    baseRate: decimal(500),
    gstPercent: decimal(18),
    nationwideCut: decimal(100),
    isActive: true,
    createdByAdminId: 'admin-1',
    updatedByAdminId: null,
    rateCard: {
      id: 'card-1',
      zoneId: 'zone-1',
      shipmentType: 'PACKAGE',
      currency: 'INR',
      zone: {
        id: 'zone-1',
        rateProviderId: 'provider-1',
        name: 'Zone A',
        rateProvider: { id: 'provider-1', name: 'FedEx' },
      },
    },
    createdBy: { email: 'admin@nationwide.dev' },
    updatedBy: null,
    ...overrides,
  };
}

function baseCreateDto(overrides: Record<string, unknown> = {}) {
  return {
    zoneId: 'zone-1',
    shipmentType: 'PACKAGE',
    weightFromKg: 2,
    weightToKg: 2,
    baseRate: 500,
    gstPercent: 18,
    nationwideCut: 100,
    ...overrides,
  } as never;
}

describe('RatesService', () => {
  let prisma: {
    rateCard: { upsert: jest.Mock };
    weightSlab: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    zone: { findUniqueOrThrow: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let service: RatesService;

  beforeEach(() => {
    prisma = {
      rateCard: {
        upsert: jest.fn().mockResolvedValue({ id: 'card-1' }),
      },
      weightSlab: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(makeRate()),
        update: jest.fn().mockResolvedValue(makeRate()),
      },
      zone: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'zone-1',
          name: 'Zone A',
          rateProvider: { id: 'provider-1', name: 'FedEx' },
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    service = new RatesService(prisma as never);
  });

  describe('create', () => {
    it('rejects weightToKg less than weightFromKg', async () => {
      await expect(
        service.create(
          baseCreateDto({ weightFromKg: 5, weightToKg: 2 }),
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.rateCard.upsert).not.toHaveBeenCalled();
    });

    it('rejects gstPercent over 100', async () => {
      await expect(
        service.create(baseCreateDto({ gstPercent: 150 }), 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('finds-or-creates the RateCard via an atomic upsert, not a separate lookup', async () => {
      await service.create(baseCreateDto(), 'admin-1');

      expect(prisma.rateCard.upsert).toHaveBeenCalledWith({
        where: {
          zoneId_shipmentType: { zoneId: 'zone-1', shipmentType: 'PACKAGE' },
        },
        update: {},
        create: {
          zoneId: 'zone-1',
          shipmentType: 'PACKAGE',
          createdByAdminId: 'admin-1',
        },
      });
    });

    it('rejects a new range that overlaps a different active sibling', async () => {
      prisma.weightSlab.findMany.mockResolvedValue([
        makeRate({
          id: 'sibling-1',
          weightFromKg: decimal(1),
          weightToKg: decimal(3),
        }),
      ]);

      await expect(
        service.create(
          baseCreateDto({ weightFromKg: 2, weightToKg: 4 }),
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.weightSlab.create).not.toHaveBeenCalled();
    });

    it('rejects an exact duplicate active range with a structured 409', async () => {
      prisma.weightSlab.findMany.mockResolvedValue([
        makeRate({
          id: 'existing-1',
          weightFromKg: decimal(2),
          weightToKg: decimal(2),
        }),
      ]);

      let caught: unknown;
      try {
        await service.create(baseCreateDto(), 'admin-1');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({
        message: 'duplicate_rate',
        existingRateId: 'existing-1',
        rateProviderName: 'FedEx',
        zoneName: 'Zone A',
        shipmentType: 'PACKAGE',
        weightFromKg: 2,
        weightToKg: 2,
      });
      expect(prisma.weightSlab.create).not.toHaveBeenCalled();
    });

    it('does not treat an inactive sibling with the same range as a duplicate or overlap', async () => {
      prisma.weightSlab.findMany.mockResolvedValue([]);

      await service.create(baseCreateDto(), 'admin-1');

      expect(prisma.weightSlab.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rateCardId: 'card-1',
            weightFromKg: 2,
            weightToKg: 2,
            baseRate: 500,
            createdByAdminId: 'admin-1',
          }),
        }),
      );
    });

    it('creates the rate and writes a RATE_CREATED audit log', async () => {
      await service.create(baseCreateDto(), 'admin-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-1',
          action: 'RATE_CREATED',
          entity: 'WeightSlab',
          entityId: 'rate-1',
          before: {},
          after: expect.objectContaining({ baseRate: 500 }),
        }),
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for an unknown rate', async () => {
      prisma.weightSlab.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', {}, 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects an updated range where weightToKg < weightFromKg', async () => {
      prisma.weightSlab.findUnique.mockResolvedValue(makeRate());
      await expect(
        service.update('rate-1', { weightToKg: 1 }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects overlap against a sibling, excluding itself', async () => {
      prisma.weightSlab.findUnique.mockResolvedValue(makeRate());
      prisma.weightSlab.findMany.mockResolvedValue([
        makeRate({
          id: 'sibling-1',
          weightFromKg: decimal(5),
          weightToKg: decimal(8),
        }),
      ]);

      await expect(
        service.update('rate-1', { weightFromKg: 6, weightToKg: 7 }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.weightSlab.findMany).toHaveBeenCalledWith({
        where: { rateCardId: 'card-1', isActive: true, id: { not: 'rate-1' } },
      });
    });

    it('writes a field-level before/after RATE_UPDATED audit log', async () => {
      prisma.weightSlab.findUnique.mockResolvedValue(makeRate());
      prisma.weightSlab.update.mockResolvedValue(
        makeRate({ baseRate: decimal(700) }),
      );

      await service.update('rate-1', { baseRate: 700 }, 'admin-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RATE_UPDATED',
          entity: 'WeightSlab',
          entityId: 'rate-1',
          before: expect.objectContaining({ baseRate: 500 }),
          after: expect.objectContaining({ baseRate: 700 }),
        }),
      });
      expect(prisma.weightSlab.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rate-1' },
          data: expect.objectContaining({
            baseRate: 700,
            updatedByAdminId: 'admin-1',
          }),
        }),
      );
    });
  });

  describe('setActive', () => {
    it('is a no-op when the rate is already in the requested state', async () => {
      const rate = makeRate({ isActive: true });
      prisma.weightSlab.findUnique.mockResolvedValue(rate);

      const result = await service.setActive('rate-1', true, 'admin-1');

      expect(result).toBe(rate);
      expect(prisma.weightSlab.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('deactivates an active rate and writes a RATE_DEACTIVATED audit log', async () => {
      prisma.weightSlab.findUnique.mockResolvedValue(
        makeRate({ isActive: true }),
      );
      prisma.weightSlab.update.mockResolvedValue(makeRate({ isActive: false }));

      await service.setActive('rate-1', false, 'admin-1');

      expect(prisma.weightSlab.update).toHaveBeenCalledWith({
        where: { id: 'rate-1' },
        data: { isActive: false, updatedByAdminId: 'admin-1' },
        include: expect.anything(),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RATE_DEACTIVATED',
          before: { isActive: true },
          after: { isActive: false },
        }),
      });
    });

    it('re-checks overlap against active siblings before reactivating', async () => {
      prisma.weightSlab.findUnique.mockResolvedValue(
        makeRate({ isActive: false }),
      );
      prisma.weightSlab.findMany.mockResolvedValue([
        makeRate({
          id: 'sibling-1',
          weightFromKg: decimal(1),
          weightToKg: decimal(3),
        }),
      ]);

      await expect(
        service.setActive('rate-1', true, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.weightSlab.update).not.toHaveBeenCalled();
    });

    it('reactivates cleanly when no active sibling overlaps it', async () => {
      prisma.weightSlab.findUnique.mockResolvedValue(
        makeRate({ isActive: false }),
      );
      prisma.weightSlab.findMany.mockResolvedValue([]);
      prisma.weightSlab.update.mockResolvedValue(makeRate({ isActive: true }));

      await service.setActive('rate-1', true, 'admin-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'RATE_ACTIVATED' }),
      });
    });
  });
});
