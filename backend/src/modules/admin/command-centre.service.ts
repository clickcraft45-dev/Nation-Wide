import { Injectable } from '@nestjs/common';
import type { CommandCentreDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { analyticsWindow, round2 } from './analytics-window';

/**
 * The company-wide picture, for SUPER_ADMIN only: money in against money out, where the work is,
 * and who is doing it.
 *
 * Every figure is a database aggregate, not a table fetched and counted in Node — this is read on
 * a dashboard that refreshes, and "select everything and length it" is how a dashboard becomes the
 * slowest page in an app.
 *
 * Revenue means money actually COLLECTED (paid orders, by the day they were paid), not invoiced: a
 * business comparing its outgoings against what it has been promised is comparing the wrong two
 * numbers. It used to read receipts, but only the pickup flow issues those, so a payment an admin
 * marked by hand never counted; paid orders are what the reports total too.
 */
@Injectable()
export class CommandCentreService {
  constructor(private readonly prisma: PrismaService) {}

  async get(from?: string, to?: string): Promise<CommandCentreDto> {
    const w = analyticsWindow(from, to, 180);
    const span = { gte: w.previousStart, lt: w.end };
    const inWindow = { gte: w.start, lt: w.end };
    const today = new Date();
    const startOfToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );

    const [
      paidOrders,
      expenses,
      expensesByCategory,
      customers,
      b2bCustomers,
      admins,
      partners,
      activePartners,
      unpaidOrders,
      receivedToday,
      spentToday,
      partnerLeaderboard,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { paymentStatus: 'PAID', paidAt: span },
        select: { paidAmount: true, paidAt: true },
      }),
      this.prisma.expense.findMany({
        where: { expenseDate: span },
        select: { amount: true, expenseDate: true },
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { expenseDate: inWindow },
        _sum: { amount: true },
      }),
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { isB2b: true } }),
      this.prisma.adminUser.groupBy({
        by: ['role', 'isActive'],
        _count: { _all: true },
      }),
      this.prisma.adminUser.count({ where: { role: 'PICKUP_PARTNER' } }),
      this.prisma.adminUser.count({
        where: { role: 'PICKUP_PARTNER', isActive: true },
      }),
      this.prisma.order.count({ where: { paymentStatus: 'PENDING' } }),
      this.prisma.order.aggregate({
        where: { paymentStatus: 'PAID', paidAt: { gte: startOfToday } },
        _sum: { paidAmount: true },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.pickupRequest.groupBy({
        by: ['assignedPartnerId'],
        // Pickups finished in the window: the order is created the moment the parcel is accepted.
        where: {
          status: 'COMPLETED',
          assignedPartnerId: { not: null },
          order: { createdAt: inWindow },
        },
        _count: { _all: true },
        _sum: { collectedAmount: true },
        orderBy: { _count: { assignedPartnerId: 'desc' } },
        take: 5,
      }),
    ]);

    // Every bucket present, oldest first, so a quiet period still shows as a zero rather than
    // disappearing and making the chart lie about the shape of the business.
    const buckets = new Map(
      w.keys.map((start) => [start, { revenue: 0, expenses: 0 }]),
    );
    let revenue = 0;
    let previousRevenue = 0;
    for (const order of paidOrders) {
      const amount = order.paidAmount ?? 0;
      const key = w.keyOf(order.paidAt!);
      if (key) {
        revenue += amount;
        buckets.get(key)!.revenue += amount;
      } else previousRevenue += amount;
    }
    let spend = 0;
    let previousSpend = 0;
    for (const expense of expenses) {
      const key = w.keyOf(expense.expenseDate);
      if (key) {
        spend += expense.amount;
        buckets.get(key)!.expenses += expense.amount;
      } else previousSpend += expense.amount;
    }

    // groupBy hands back category ids; the chart needs the headings they stand for.
    const spendCategories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: expensesByCategory.map((row) => row.categoryId) } },
      include: { parent: { select: { name: true } } },
    });
    const categoryNameById = new Map(
      spendCategories.map((c) => [
        c.id,
        c.parent ? `${c.parent.name} → ${c.name}` : c.name,
      ]),
    );

    const partnerIds = partnerLeaderboard
      .map((row) => row.assignedPartnerId)
      .filter((id): id is string => id !== null);
    const partnerNames = await this.prisma.adminUser.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, name: true, email: true },
    });
    const nameById = new Map(
      partnerNames.map((p) => [p.id, p.name ?? p.email]),
    );

    const roleCount = (role: string, active: boolean) =>
      admins
        .filter((row) => row.role === role && row.isActive === active)
        .reduce((sum, row) => sum + row._count._all, 0);

    return {
      from: w.from,
      to: w.to,
      bucket: w.bucket,
      series: [...buckets].map(([start, b]) => ({
        start,
        revenue: round2(b.revenue),
        expenses: round2(b.expenses),
        profit: round2(b.revenue - b.expenses),
      })),
      money: {
        revenue: round2(revenue),
        expenses: round2(spend),
        profit: round2(revenue - spend),
        previousRevenue: round2(previousRevenue),
        previousExpenses: round2(previousSpend),
        // A margin needs something to be a share OF; with no revenue it is not zero, it is
        // undefined, and printing 0% would read as "we broke even".
        marginPercent:
          revenue > 0 ? round2(((revenue - spend) / revenue) * 100) : null,
        receivedToday: round2(receivedToday._sum.paidAmount ?? 0),
        spentToday: round2(spentToday._sum.amount ?? 0),
        unpaidOrders,
      },
      expensesByCategory: expensesByCategory
        .map((row) => ({
          category: categoryNameById.get(row.categoryId) ?? 'Uncategorised',
          amount: round2(row._sum.amount ?? 0),
        }))
        .sort((a, b) => b.amount - a.amount),
      people: {
        customers,
        b2bCustomers,
        superAdmins: roleCount('SUPER_ADMIN', true),
        admins: roleCount('ADMIN', true),
        deactivatedAdmins:
          roleCount('ADMIN', false) + roleCount('SUPER_ADMIN', false),
        partners,
        activePartners,
      },
      partnerLeaderboard: partnerLeaderboard.map((row) => ({
        partnerId: row.assignedPartnerId!,
        name: nameById.get(row.assignedPartnerId!) ?? 'Unknown',
        completed: row._count._all,
        collected: round2(row._sum.collectedAmount ?? 0),
      })),
    };
  }
}
