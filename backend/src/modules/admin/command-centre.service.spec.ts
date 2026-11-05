import { CommandCentreService } from './command-centre.service';
import { istDay } from './analytics-window';

/**
 * The numbers on this screen are the ones a business makes decisions on, so the arithmetic is
 * what is pinned here: profit, margin, the change against the window before, and the buckets that
 * must not silently drop a period with no activity.
 */
describe('CommandCentreService', () => {
  const thisMonth = new Date();
  const longAgo = new Date(Date.now() - 200 * 86_400_000);

  function harness(overrides: Record<string, unknown> = {}) {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { paidAmount: 1000, paidAt: thisMonth },
          { paidAmount: 500, paidAt: thisMonth },
          { paidAmount: 300, paidAt: longAgo },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { paidAmount: 250 } }),
        count: jest.fn().mockResolvedValue(4),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 600, expenseDate: thisMonth },
          { amount: 50, expenseDate: longAgo },
        ]),
        groupBy: jest.fn().mockResolvedValue([
          { categoryId: 'cat-salary', _sum: { amount: 400 } },
          { categoryId: 'cat-fuel', _sum: { amount: 200 } },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
      customer: { count: jest.fn().mockResolvedValue(42) },
      expenseCategory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat-salary', name: 'Salary', parent: null },
          { id: 'cat-fuel', name: 'Fuel', parent: null },
        ]),
      },
      adminUser: {
        groupBy: jest.fn().mockResolvedValue([
          { role: 'ADMIN', isActive: true, _count: { _all: 3 } },
          { role: 'SUPER_ADMIN', isActive: true, _count: { _all: 1 } },
          { role: 'ADMIN', isActive: false, _count: { _all: 2 } },
        ]),
        count: jest.fn().mockResolvedValue(7),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'p1', name: 'Ravi', email: 'r@n.dev' }]),
      },
      pickupRequest: {
        groupBy: jest.fn().mockResolvedValue([
          {
            assignedPartnerId: 'p1',
            _count: { _all: 9 },
            _sum: { collectedAmount: 8100 },
          },
        ]),
      },
      ...overrides,
    };
    return { prisma, service: new CommandCentreService(prisma as never) };
  }

  it('reports money received against money spent, with the profit and margin between them', async () => {
    const { service } = harness();

    const result = await service.get();

    expect(result.money.revenue).toBe(1500);
    expect(result.money.expenses).toBe(600);
    expect(result.money.profit).toBe(900);
    expect(result.money.marginPercent).toBe(60);
    expect(result.money.receivedToday).toBe(250);
    expect(result.money.spentToday).toBe(100);
  });

  it('keeps the window before apart, for the change badges', async () => {
    const { service } = harness();

    const result = await service.get();

    // The default window is 180 days; 200 days ago falls in the one before it.
    expect(result.money.previousRevenue).toBe(300);
    expect(result.money.previousExpenses).toBe(50);
  });

  it('leaves the margin undefined when nothing came in, rather than calling it zero', async () => {
    const { service } = harness({
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { paidAmount: null } }),
        count: jest.fn().mockResolvedValue(0),
      },
    });

    const result = await service.get();

    // 0% would read as "we broke even"; we did not, we spent 600 and took nothing.
    expect(result.money.marginPercent).toBeNull();
    expect(result.money.profit).toBe(-600);
  });

  it('returns every bucket of the chosen range, oldest first, including the quiet ones', async () => {
    const { service } = harness();
    const today = istDay(new Date());
    const from = istDay(new Date(Date.now() - 29 * 86_400_000));

    const result = await service.get(from, today);

    expect(result.bucket).toBe('day');
    expect(result.series).toHaveLength(30);
    expect(result.series.at(-1)).toMatchObject({
      start: today,
      revenue: 1500,
      expenses: 600,
    });
    // A day with no money in or out is a zero, not a gap; otherwise the chart draws straight
    // across it and lies about the shape of the business.
    expect(result.series[0]).toMatchObject({
      start: from,
      revenue: 0,
      expenses: 0,
      profit: 0,
    });
  });

  it('names the spend categories rather than charting their ids', async () => {
    const { service } = harness();

    const result = await service.get();

    expect(result.expensesByCategory).toEqual([
      { category: 'Salary', amount: 400 },
      { category: 'Fuel', amount: 200 },
    ]);
  });

  it('counts the people by role, keeping deactivated accounts separate', async () => {
    const { service } = harness();

    const result = await service.get();

    expect(result.people).toMatchObject({
      admins: 3,
      superAdmins: 1,
      deactivatedAdmins: 2,
      customers: 42,
    });
  });

  it('names the partners on the leaderboard and totals what they collected', async () => {
    const { service } = harness();

    const result = await service.get();

    expect(result.partnerLeaderboard[0]).toEqual({
      partnerId: 'p1',
      name: 'Ravi',
      completed: 9,
      collected: 8100,
    });
  });
});
