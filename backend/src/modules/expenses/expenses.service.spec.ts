import { NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let prisma: {
    expense: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    expenseCategory: { findMany: jest.Mock };
  };
  let service: ExpensesService;

  beforeEach(() => {
    prisma = {
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'exp-1' }),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 7500 }, _count: 3 }),
        groupBy: jest.fn().mockResolvedValue([
          { categoryId: 'cat-fuel', _sum: { amount: 2500 } },
          { categoryId: 'cat-rent', _sum: { amount: 5000 } },
        ]),
        create: jest.fn().mockResolvedValue({ id: 'exp-1' }),
        update: jest.fn().mockResolvedValue({ id: 'exp-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'exp-1' }),
      },
      expenseCategory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat-fuel', name: 'Fuel', parent: null },
          { id: 'cat-rent', name: 'Rent', parent: { name: 'Premises' } },
        ]),
      },
    };
    service = new ExpensesService(prisma as never);
  });

  it('totals the whole filter, not just the page, and ranks categories by spend', async () => {
    const from = new Date('2026-09-01');
    const to = new Date('2026-09-30');

    const result = await service.list({ from, to, take: 1 });

    const listWhere = prisma.expense.findMany.mock.calls[0][0].where;
    expect(prisma.expense.aggregate.mock.calls[0][0].where).toEqual(listWhere);
    expect(listWhere.expenseDate).toEqual({ gte: from, lte: to });
    expect(result.totalAmount).toBe(7500);
    expect(result.total).toBe(3);
    // Named, not uuid'd, and a subcategory says where it sits.
    expect(result.byCategory).toEqual([
      { categoryId: 'cat-rent', categoryName: 'Premises → Rent', amount: 5000 },
      { categoryId: 'cat-fuel', categoryName: 'Fuel', amount: 2500 },
    ]);
  });

  it('filters by a category together with everything filed under it', async () => {
    await service.list({ categoryId: 'cat-cleaning' });

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { categoryId: 'cat-cleaning' },
      { category: { parentId: 'cat-cleaning' } },
    ]);
  });

  it('narrows a category filter by the search rather than widening past it', async () => {
    await service.list({ categoryId: 'cat-cleaning', search: 'acme' });

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    // The category stays on OR; the text sits under AND, so the two conditions compose.
    expect(where.OR).toHaveLength(2);
    expect(where.AND[0].OR).toHaveLength(3);
  });

  it('searches vendor, description and reference together', async () => {
    await service.list({ search: 'indian oil' });

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toHaveLength(3);
    expect(where.AND[0].OR[0]).toEqual({
      paidTo: { contains: 'indian oil', mode: 'insensitive' },
    });
  });

  it('stamps the recording admin on create', async () => {
    await service.create({ amount: 100 } as never, 'admin-9');

    expect(prisma.expense.create.mock.calls[0][0].data.recordedByAdminId).toBe(
      'admin-9',
    );
  });

  it('refuses to update or delete a row that is not there', async () => {
    prisma.expense.findUnique.mockResolvedValue(null);

    await expect(service.update('nope', {} as never)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    expect(prisma.expense.delete).not.toHaveBeenCalled();
  });
});
