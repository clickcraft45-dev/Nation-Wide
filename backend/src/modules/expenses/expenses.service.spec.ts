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
          { category: 'FUEL', _sum: { amount: 2500 } },
          { category: 'RENT', _sum: { amount: 5000 } },
        ]),
        create: jest.fn().mockResolvedValue({ id: 'exp-1' }),
        update: jest.fn().mockResolvedValue({ id: 'exp-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'exp-1' }),
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
    expect(result.byCategory).toEqual([
      { category: 'RENT', amount: 5000 },
      { category: 'FUEL', amount: 2500 },
    ]);
  });

  it('searches vendor, description and reference together', async () => {
    await service.list({ search: 'indian oil' });

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({
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
