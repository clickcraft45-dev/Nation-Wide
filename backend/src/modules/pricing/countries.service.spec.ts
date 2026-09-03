import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CountriesService } from './countries.service';

function makeCountry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'country-1',
    name: 'India',
    code: 'IN',
    isActive: true,
    ...overrides,
  };
}

describe('CountriesService', () => {
  let prisma: {
    country: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: CountriesService;

  beforeEach(() => {
    prisma = {
      country: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makeCountry()),
        update: jest.fn().mockResolvedValue(makeCountry()),
      },
    };
    service = new CountriesService(prisma as never);
  });

  describe('findAllActive', () => {
    it('filters to isActive countries only', async () => {
      await service.findAllActive();
      expect(prisma.country.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('rejects a case-insensitive duplicate name', async () => {
      prisma.country.findFirst.mockResolvedValue(
        makeCountry({ name: 'india' }),
      );
      await expect(
        service.create({ name: 'India', code: 'IN' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.country.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate code', async () => {
      prisma.country.findUnique.mockResolvedValue(makeCountry());
      await expect(
        service.create({ name: 'Indonesia', code: 'IN' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.country.create).not.toHaveBeenCalled();
    });

    it('creates when name and code are both free', async () => {
      await service.create({ name: 'Germany', code: 'DE' });
      expect(prisma.country.create).toHaveBeenCalledWith({
        data: { name: 'Germany', code: 'DE' },
      });
    });
  });

  describe('update', () => {
    it('404s when the country does not exist', async () => {
      prisma.country.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects renaming to a name already taken by another country', async () => {
      prisma.country.findUnique.mockResolvedValue(makeCountry());
      prisma.country.findFirst.mockResolvedValue(
        makeCountry({ id: 'country-2', name: 'Germany' }),
      );
      await expect(
        service.update('country-1', { name: 'Germany' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.country.update).not.toHaveBeenCalled();
    });

    it('excludes the country itself from the name-clash check', async () => {
      prisma.country.findUnique.mockResolvedValue(makeCountry());
      await service.update('country-1', { name: 'India' });
      expect(prisma.country.findFirst).toHaveBeenCalledWith({
        where: {
          name: { equals: 'India', mode: 'insensitive' },
          id: { not: 'country-1' },
        },
      });
      expect(prisma.country.update).toHaveBeenCalled();
    });
  });
});
