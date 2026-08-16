import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZonesService } from './zones.service';

function makeZone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zone-1',
    rateProviderId: 'provider-1',
    name: 'Zone A',
    rateProvider: { id: 'provider-1', name: 'FedEx' },
    _count: { countries: 0 },
    ...overrides,
  };
}

describe('ZonesService', () => {
  let prisma: {
    zone: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    zoneCountry: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let service: ZonesService;

  beforeEach(() => {
    prisma = {
      zone: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(makeZone()),
        create: jest.fn().mockResolvedValue({ id: 'zone-1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      zoneCountry: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new ZonesService(prisma as never);
  });

  describe('create', () => {
    it('rejects a duplicate name for the same provider', async () => {
      prisma.zone.findUnique.mockResolvedValue(makeZone());
      await expect(
        service.create({
          rateProviderId: 'provider-1',
          name: 'Zone A',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });

    it('creates when the name is free for that provider', async () => {
      prisma.zone.findUnique
        .mockResolvedValueOnce(null) // duplicate-name check
        .mockResolvedValueOnce(makeZone()); // findOneOrThrow after create
      await service.create({
        rateProviderId: 'provider-1',
        name: 'Zone B',
      });
      expect(prisma.zone.create).toHaveBeenCalledWith({
        data: { rateProviderId: 'provider-1', name: 'Zone B' },
      });
    });
  });

  describe('update', () => {
    it('404s when the zone does not exist', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects renaming to a name already used by another zone under the same provider', async () => {
      prisma.zone.findUnique
        .mockResolvedValueOnce(makeZone({ id: 'zone-1' })) // findOneOrThrow(id)
        .mockResolvedValueOnce(makeZone({ id: 'zone-2', name: 'Zone B' })); // clash lookup
      await expect(
        service.update('zone-1', { name: 'Zone B' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.zone.update).not.toHaveBeenCalled();
    });

    it('allows renaming to the same name on the same zone (no-op clash)', async () => {
      prisma.zone.findUnique
        .mockResolvedValueOnce(makeZone({ id: 'zone-1', name: 'Zone A' }))
        .mockResolvedValueOnce(makeZone({ id: 'zone-1', name: 'Zone A' }))
        .mockResolvedValueOnce(makeZone({ id: 'zone-1', name: 'Zone A' }));
      await service.update('zone-1', { name: 'Zone A' });
      expect(prisma.zone.update).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        data: { name: 'Zone A' },
      });
    });
  });

  describe('assignCountry', () => {
    it('upserts on the (rateProviderId, countryId) key derived from the zone, not a client-supplied provider', async () => {
      prisma.zone.findUnique.mockResolvedValue(
        makeZone({ id: 'zone-1', rateProviderId: 'provider-1' }),
      );
      await service.assignCountry('zone-1', {
        countryId: 'country-1',
      });
      expect(prisma.zoneCountry.upsert).toHaveBeenCalledWith({
        where: {
          rateProviderId_countryId: {
            rateProviderId: 'provider-1',
            countryId: 'country-1',
          },
        },
        update: { zoneId: 'zone-1' },
        create: {
          zoneId: 'zone-1',
          countryId: 'country-1',
          rateProviderId: 'provider-1',
        },
      });
    });

    it('404s when the target zone does not exist', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);
      await expect(
        service.assignCountry('missing', { countryId: 'country-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.zoneCountry.upsert).not.toHaveBeenCalled();
    });
  });

  describe('unassignCountry', () => {
    it('deletes by zoneId + countryId', async () => {
      await service.unassignCountry('zone-1', 'country-1');
      expect(prisma.zoneCountry.deleteMany).toHaveBeenCalledWith({
        where: { zoneId: 'zone-1', countryId: 'country-1' },
      });
    });
  });
});
