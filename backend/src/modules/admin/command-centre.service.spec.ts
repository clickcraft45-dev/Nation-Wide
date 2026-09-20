import { CommandCentreService } from './command-centre.service';

/**
 * The numbers on this screen are the ones a business makes decisions on, so the arithmetic is
 * what is pinned here: profit, margin, and the month buckets that must not silently drop a month
 * with no activity.
 */
describe('CommandCentreService', () => {
  const thisMonth = new Date();
  const monthKey = thisMonth.toISOString().slice(0, 7);

  function harness(overrides: Record<string, unknown> = {}) {
    const prisma = {
      receipt: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 1000, receivedAt: thisMonth },
          { amount: 500, receivedAt: thisMonth },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 250 } }),
      },
      expense: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ amount: 600, expenseDate: thisMonth }]),
        groupBy: jest.fn().mockResolvedValue([
          { category: 'SALARY', _sum: { amount: 400 } },
          { category: 'FUEL', _sum: { amount: 200 } },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
      customer: { count: jest.fn().mockResolvedValue(42) },
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
      order: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ status: 'PENDING', _count: { _all: 4 } }]),
        count: jest.fn().mockResolvedValue(4),
      },
      pickupRequest: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ status: 'ASSIGNED', _count: { _all: 2 } }])
          .mockResolvedValueOnce([
            {
              assignedPartnerId: 'p1',
              _count: { _all: 9 },
              _sum: { collectedAmount: 8100 },
            },
          ]),
      },
      quote: {
        count: jest.fn().mockResolvedValue(5),
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { destCountry: 'United States', _count: { _all: 12 } },
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

  it('leaves the margin undefined when nothing came in, rather than calling it zero', async () => {
    const { service } = harness({
      receipt: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    });

    const result = await service.get();

    // 0% would read as "we broke even"; we did not, we spent 600 and took nothing.
    expect(result.money.marginPercent).toBeNull();
    expect(result.money.profit).toBe(-600);
  });

  it('returns six months, oldest first, including the quiet ones', async () => {
    const { service } = harness();

    const result = await service.get();

    expect(result.months).toHaveLength(6);
    expect(result.months.at(-1)!.month).toBe(monthKey);
    expect(result.months.at(-1)!.revenue).toBe(1500);
    // A month with no receipts and no expenses is a zero, not a gap — otherwise the chart draws
    // a straight line across it and lies about the shape of the business.
    expect(result.months[0]).toMatchObject({
      revenue: 0,
      expenses: 0,
      profit: 0,
    });
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
