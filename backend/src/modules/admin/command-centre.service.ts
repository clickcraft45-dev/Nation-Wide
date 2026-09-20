import { Injectable } from '@nestjs/common';
import type { CommandCentreDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

const MONTHS = 6;

/** First day of the month, `offset` months back from this one, in UTC. */
function monthStart(offset: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
  );
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7); // "2026-09"
}

/**
 * The company-wide picture, for SUPER_ADMIN only: money in against money out, where the work is,
 * and who is doing it.
 *
 * Every figure is a database aggregate, not a table fetched and counted in Node — this is read on
 * a dashboard that refreshes, and "select everything and length it" is how a dashboard becomes the
 * slowest page in an app.
 *
 * Revenue means money actually RECEIVED (receipts), not invoiced: a business comparing its outgoings
 * against what it has been promised is comparing the wrong two numbers.
 */
@Injectable()
export class CommandCentreService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<CommandCentreDto> {
    const since = monthStart(MONTHS - 1);
    const today = new Date();
    const startOfToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );

    const [
      receipts,
      expenses,
      expensesByCategory,
      customers,
      b2bCustomers,
      admins,
      partners,
      activePartners,
      ordersByStatus,
      pickupsByStatus,
      quotesAwaiting,
      unpaidOrders,
      receivedToday,
      spentToday,
      topDestinations,
      partnerLeaderboard,
    ] = await Promise.all([
      this.prisma.receipt.findMany({
        where: { receivedAt: { gte: since } },
        select: { amount: true, receivedAt: true },
      }),
      this.prisma.expense.findMany({
        where: { expenseDate: { gte: since } },
        select: { amount: true, expenseDate: true },
      }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where: { expenseDate: { gte: since } },
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
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.pickupRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.quote.count({
        where: { status: { in: ['SUBMITTED', 'NEEDS_MANUAL_REVIEW'] } },
      }),
      this.prisma.order.count({ where: { paymentStatus: 'PENDING' } }),
      this.prisma.receipt.aggregate({
        where: { receivedAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.quote.groupBy({
        by: ['destCountry'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { destCountry: 'desc' } },
        take: 6,
      }),
      this.prisma.pickupRequest.groupBy({
        by: ['assignedPartnerId'],
        where: { status: 'COMPLETED', assignedPartnerId: { not: null } },
        _count: { _all: true },
        _sum: { collectedAmount: true },
        orderBy: { _count: { assignedPartnerId: 'desc' } },
        take: 5,
      }),
    ]);

    // Six buckets, oldest first, so a month with no activity still shows as a zero rather than
    // disappearing and making the line lie about the shape of the business.
    const months = Array.from({ length: MONTHS }, (_, i) =>
      monthKey(monthStart(MONTHS - 1 - i)),
    );
    const zeroed = new Map(
      months.map((month) => [month, { revenue: 0, expenses: 0 }]),
    );
    for (const receipt of receipts) {
      const bucket = zeroed.get(monthKey(receipt.receivedAt));
      if (bucket) bucket.revenue += receipt.amount;
    }
    for (const expense of expenses) {
      const bucket = zeroed.get(monthKey(expense.expenseDate));
      if (bucket) bucket.expenses += expense.amount;
    }

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

    const revenue = receipts.reduce((sum, r) => sum + r.amount, 0);
    const spend = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      months: months.map((month) => ({
        month,
        revenue: round2(zeroed.get(month)!.revenue),
        expenses: round2(zeroed.get(month)!.expenses),
        profit: round2(
          zeroed.get(month)!.revenue - zeroed.get(month)!.expenses,
        ),
      })),
      money: {
        revenue: round2(revenue),
        expenses: round2(spend),
        profit: round2(revenue - spend),
        // A margin needs something to be a share OF; with no revenue it is not zero, it is
        // undefined, and printing 0% would read as "we broke even".
        marginPercent:
          revenue > 0 ? round2(((revenue - spend) / revenue) * 100) : null,
        receivedToday: round2(receivedToday._sum.amount ?? 0),
        spentToday: round2(spentToday._sum.amount ?? 0),
        unpaidOrders,
      },
      expensesByCategory: expensesByCategory
        .map((row) => ({
          category: row.category,
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
      work: {
        ordersByStatus: ordersByStatus.map((row) => ({
          label: row.status,
          count: row._count._all,
        })),
        pickupsByStatus: pickupsByStatus.map((row) => ({
          label: row.status,
          count: row._count._all,
        })),
        quotesAwaiting,
      },
      topDestinations: topDestinations.map((row) => ({
        label: row.destCountry,
        count: row._count._all,
      })),
      partnerLeaderboard: partnerLeaderboard.map((row) => ({
        partnerId: row.assignedPartnerId!,
        name: nameById.get(row.assignedPartnerId!) ?? 'Unknown',
        completed: row._count._all,
        collected: round2(row._sum.collectedAmount ?? 0),
      })),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
