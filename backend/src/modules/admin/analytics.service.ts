import { Injectable } from '@nestjs/common';
import type {
  AnalyticsDto,
  AnalyticsPointDto,
  AnalyticsTotalsDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { analyticsWindow, bump, ranked, round2 } from './analytics-window';

const zero = (): AnalyticsTotalsDto => ({
  orders: 0,
  delivered: 0,
  cancelled: 0,
  shipments: 0,
  revenue: 0,
  paidOrders: 0,
  newCustomers: 0,
  quotes: 0,
  convertedQuotes: 0,
});

/**
 * The numbers behind the admin dashboard and reports, aggregated here rather than in the browser.
 * Both pages used to download raw orders and count them, and the unpaginated /orders list stops
 * at 1000 rows, so a busy window quietly under-reported every figure.
 *
 * ponytail: rows are fetched with a minimal select and bucketed in Node, which is fine into the
 * tens of thousands of orders per window. Past that, move the bucketing into SQL (date_trunc in
 * Asia/Kolkata) with $queryRaw.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(from?: string, to?: string): Promise<AnalyticsDto> {
    const w = analyticsWindow(from, to, 30);
    const span = { gte: w.previousStart, lt: w.end };

    const [orders, paid, customers, quotes, providers] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: span },
        select: {
          createdAt: true,
          status: true,
          shipments: { select: { currentStatus: true, providerId: true } },
          quote: { select: { destCountry: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { paymentStatus: 'PAID', paidAt: span },
        select: { paidAt: true, paidAmount: true, paymentMethod: true },
      }),
      this.prisma.customer.findMany({
        where: { createdAt: span },
        select: { createdAt: true },
      }),
      this.prisma.quote.findMany({
        where: { createdAt: span },
        select: { createdAt: true, orderId: true },
      }),
      this.prisma.shippingProvider.findMany({
        select: { id: true, name: true },
      }),
    ]);

    const current = zero();
    const previous = zero();
    const totalsFor = (date: Date) => (date >= w.start ? current : previous);
    const points = new Map<string, AnalyticsPointDto>(
      w.keys.map((start) => [
        start,
        { start, orders: 0, delivered: 0, revenue: 0, newCustomers: 0 },
      ]),
    );
    const pointFor = (date: Date) => {
      const key = w.keyOf(date);
      return key ? points.get(key) : undefined;
    };

    const providerName = new Map(providers.map((p) => [p.id, p.name]));
    const status = new Map<string, number>();
    const carriers = new Map<string, number>();
    const destinations = new Map<string, number>();
    const methods = new Map<string, number>();

    for (const order of orders) {
      const totals = totalsFor(order.createdAt);
      const delivered =
        order.shipments.length > 0 &&
        order.shipments.every((s) => s.currentStatus === 'DELIVERED');
      totals.orders++;
      totals.shipments += order.shipments.length;
      if (delivered) totals.delivered++;
      if (order.status === 'CANCELLED') totals.cancelled++;

      const point = pointFor(order.createdAt);
      if (!point) continue;
      point.orders++;
      if (delivered) point.delivered++;
      for (const s of order.shipments) {
        bump(status, s.currentStatus ?? 'PENDING');
        bump(carriers, providerName.get(s.providerId) ?? 'Unknown');
      }
      if (order.quote) bump(destinations, order.quote.destCountry);
    }

    for (const order of paid) {
      const amount = order.paidAmount ?? 0;
      const totals = totalsFor(order.paidAt!);
      totals.revenue += amount;
      totals.paidOrders++;
      const point = pointFor(order.paidAt!);
      if (!point) continue;
      point.revenue += amount;
      bump(methods, order.paymentMethod ?? 'NOT_RECORDED', amount);
    }

    for (const customer of customers) {
      totalsFor(customer.createdAt).newCustomers++;
      const point = pointFor(customer.createdAt);
      if (point) point.newCustomers++;
    }

    for (const quote of quotes) {
      const totals = totalsFor(quote.createdAt);
      totals.quotes++;
      if (quote.orderId) totals.convertedQuotes++;
    }

    current.revenue = round2(current.revenue);
    previous.revenue = round2(previous.revenue);

    return {
      from: w.from,
      to: w.to,
      bucket: w.bucket,
      current,
      previous,
      series: [...points.values()].map((p) => ({
        ...p,
        revenue: round2(p.revenue),
      })),
      shipmentStatus: ranked(status, 20),
      carriers: ranked(carriers, 6),
      destinations: ranked(destinations, 8),
      paymentMethods: [...methods]
        .map(([label, amount]) => ({ label, amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount),
    };
  }
}
