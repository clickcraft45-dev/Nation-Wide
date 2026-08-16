import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RateProvidersService } from './rate-providers.service';

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'provider-1',
    name: 'FedEx',
    code: 'FEDEX',
    fuelChargePercent: decimal(10),
    pssPerKg: decimal(5),
    ...overrides,
  };
}

describe('RateProvidersService', () => {
  let prisma: {
    rateProvider: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let service: RateProvidersService;

  beforeEach(() => {
    prisma = {
      rateProvider: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(makeProvider()),
        create: jest.fn().mockResolvedValue(makeProvider()),
        update: jest.fn().mockResolvedValue(makeProvider()),
      },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    service = new RateProvidersService(prisma as never);
  });

  describe('create', () => {
    it('rejects a duplicate code', async () => {
      await expect(
        service.create({ name: 'FedEx 2', code: 'FEDEX' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.rateProvider.create).not.toHaveBeenCalled();
    });

    it('creates when the code is free', async () => {
      prisma.rateProvider.findUnique.mockResolvedValue(null);
      await service.create({ name: 'DHL', code: 'DHL' });
      expect(prisma.rateProvider.create).toHaveBeenCalledWith({
        data: { name: 'DHL', code: 'DHL' },
      });
    });
  });

  describe('update', () => {
    it('404s when the provider does not exist', async () => {
      prisma.rateProvider.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not write an audit log for a plain name update', async () => {
      await service.update('provider-1', { name: 'FedEx Express' }, 'admin-1');
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('writes an audit log with before/after snapshots when fuelChargePercent changes and an actor is given', async () => {
      prisma.rateProvider.update.mockResolvedValue(
        makeProvider({ fuelChargePercent: decimal(15) }),
      );
      await service.update('provider-1', { fuelChargePercent: 15 }, 'admin-1');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'PROVIDER_CONFIG_UPDATED',
          entity: 'RateProvider',
          entityId: 'provider-1',
          before: { fuelChargePercent: 10, pssPerKg: 5 },
          after: { fuelChargePercent: 15, pssPerKg: 5 },
        },
      });
    });

    it('skips the audit log when pssPerKg changes but no actorId is supplied', async () => {
      await service.update('provider-1', { pssPerKg: 8 });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
