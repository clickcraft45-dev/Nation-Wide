import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { analyticsWindow } from './analytics-window';

describe('analyticsWindow', () => {
  it('buckets by day, week or month as the range grows', () => {
    expect(analyticsWindow('2026-01-01', '2026-01-31', 30).bucket).toBe('day');
    expect(analyticsWindow('2026-01-01', '2026-04-30', 30).bucket).toBe('week');
    expect(
      analyticsWindow('2026-01-15', '2026-10-31', 30).keys.slice(0, 2),
    ).toEqual([
      '2026-01-15', // the first month starts where the range does, not before it
      '2026-02-01',
    ]);
  });

  it('counts days in Indian time, so 00:30 IST is that day and not the one before', () => {
    const w = analyticsWindow('2026-03-01', '2026-03-10', 30);
    expect(w.keyOf(new Date('2026-03-04T19:00:00Z'))).toBe('2026-03-05');
    expect(w.keyOf(new Date('2026-02-28T19:00:00Z'))).toBe('2026-03-01');
    expect(w.keyOf(new Date('2026-02-28T18:00:00Z'))).toBeNull();
  });

  it('refuses a range that runs backwards', () => {
    expect(() => analyticsWindow('2026-03-10', '2026-03-01', 30)).toThrow(
      BadRequestException,
    );
  });
});

describe('AnalyticsService', () => {
  const at = (iso: string) => new Date(`${iso}T06:00:00Z`);

  function harness() {
    const prisma = {
      order: {
        findMany: jest
          .fn()
          // orders placed
          .mockResolvedValueOnce([
            {
              createdAt: at('2026-03-02'),
              status: 'CONFIRMED',
              shipments: [{ currentStatus: 'DELIVERED', providerId: 'dhl' }],
              quote: { destCountry: 'United States' },
            },
            {
              createdAt: at('2026-03-03'),
              status: 'CONFIRMED',
              shipments: [
                { currentStatus: 'DELIVERED', providerId: 'dhl' },
                { currentStatus: 'IN_TRANSIT', providerId: 'fedex' },
              ],
              quote: null,
            },
            // the window before
            {
              createdAt: at('2026-02-25'),
              status: 'CANCELLED',
              shipments: [],
              quote: null,
            },
          ])
          // orders paid
          .mockResolvedValueOnce([
            {
              paidAt: at('2026-03-02'),
              paidAmount: 1200.5,
              paymentMethod: 'UPI',
            },
            {
              paidAt: at('2026-03-05'),
              paidAmount: 800,
              paymentMethod: 'CASH',
            },
            { paidAt: at('2026-02-27'), paidAmount: 400, paymentMethod: 'UPI' },
          ]),
      },
      customer: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ createdAt: at('2026-03-04') }]),
      },
      quote: {
        findMany: jest.fn().mockResolvedValue([
          { createdAt: at('2026-03-01'), orderId: 'o1' },
          { createdAt: at('2026-03-01'), orderId: null },
        ]),
      },
      shippingProvider: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dhl', name: 'DHL' },
          { id: 'fedex', name: 'FedEx' },
        ]),
      },
    };
    return new AnalyticsService(prisma as never);
  }

  it('totals the window and the one before it separately', async () => {
    const result = await harness().get('2026-03-01', '2026-03-07');

    expect(result.current).toEqual({
      orders: 2,
      delivered: 1, // the second order still has a shipment in transit
      cancelled: 0,
      shipments: 3,
      revenue: 2000.5,
      paidOrders: 2,
      newCustomers: 1,
      quotes: 2,
      convertedQuotes: 1,
    });
    expect(result.previous).toMatchObject({
      orders: 1,
      cancelled: 1,
      revenue: 400,
    });
  });

  it('dates revenue by the day it was paid and keeps empty days in the series', async () => {
    const result = await harness().get('2026-03-01', '2026-03-07');

    expect(result.series).toHaveLength(7);
    expect(result.series[0]).toMatchObject({
      start: '2026-03-01',
      orders: 0,
      revenue: 0,
    });
    expect(result.series[4]).toMatchObject({
      start: '2026-03-05',
      revenue: 800,
    });
  });

  it('breaks the window down by carrier, destination and payment method', async () => {
    const result = await harness().get('2026-03-01', '2026-03-07');

    expect(result.carriers).toEqual([
      { label: 'DHL', count: 2 },
      { label: 'FedEx', count: 1 },
    ]);
    expect(result.destinations).toEqual([{ label: 'United States', count: 1 }]);
    expect(result.paymentMethods).toEqual([
      { label: 'UPI', amount: 1200.5 },
      { label: 'CASH', amount: 800 },
    ]);
  });
});
