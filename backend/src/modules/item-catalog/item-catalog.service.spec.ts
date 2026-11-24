import { ConflictException } from '@nestjs/common';
import { ItemCatalogService } from './item-catalog.service';

describe('ItemCatalogService', () => {
  let prisma: {
    itemCatalogEntry: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    quote: { findMany: jest.Mock };
  };
  let service: ItemCatalogService;

  beforeEach(() => {
    prisma = {
      itemCatalogEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'i1' }),
        create: jest.fn((args: { data: object }) => ({
          id: 'i1',
          ...args.data,
        })),
        update: jest.fn((args: { data: object }) => ({
          id: 'i1',
          ...args.data,
        })),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      quote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ItemCatalogService(prisma as never);
  });

  it('adds an item, trimmed, with blanks stored as nothing', async () => {
    await service.create({
      name: '  Saree ',
      category: 'Garments',
      hsCode: '',
    });
    expect(prisma.itemCatalogEntry.create).toHaveBeenCalledWith({
      data: {
        name: 'Saree',
        category: 'Garments',
        hsCode: null,
        defaultUnitValue: null,
      },
    });
  });

  it('refuses a name already on the list, whatever its case', async () => {
    prisma.itemCatalogEntry.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.create({ name: 'saree' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.itemCatalogEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'saree', mode: 'insensitive' } },
      }),
    );
  });

  it('suggests items typed on shipments that are not listed, most used first', async () => {
    prisma.itemCatalogEntry.findMany.mockResolvedValue([{ name: 'Saree' }]);
    prisma.quote.findMany.mockResolvedValue([
      {
        items: [
          { description: 'Biryani', category: 'Food', unitValue: 1200 },
          { description: 'saree', unitValue: 500 },
        ],
      },
      { items: [{ description: 'Pickles', unitValue: 300 }] },
      { items: [{ description: 'biryani ', unitValue: 900 }] },
      { items: null },
    ]);

    const result = await service.unlisted();

    expect(result).toEqual([
      {
        name: 'Biryani',
        category: 'Food',
        hsCode: null,
        unitValue: 1200,
        timesUsed: 2,
      },
      {
        name: 'Pickles',
        category: null,
        hsCode: null,
        unitValue: 300,
        timesUsed: 1,
      },
    ]);
  });
});
