import { StubShippingProviderAdapter } from './stub-shipping-provider.adapter';

describe('StubShippingProviderAdapter', () => {
  const adapter = new StubShippingProviderAdapter();

  it('returns 1-4 events in chronological order with a valid progression prefix', async () => {
    const result = await adapter.trackShipment('SOME-TRACKING-NUMBER');
    const expectedOrder = [
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ];

    expect(result.events.length).toBeGreaterThanOrEqual(1);
    expect(result.events.length).toBeLessThanOrEqual(4);
    expect(result.events.map((e) => e.status)).toEqual(
      expectedOrder.slice(0, result.events.length),
    );

    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].eventTime.getTime()).toBeGreaterThan(
        result.events[i - 1].eventTime.getTime(),
      );
    }
  });

  it('is deterministic in stage count and status sequence for the same input', async () => {
    const first = await adapter.trackShipment('REPEATABLE-INPUT');
    const second = await adapter.trackShipment('REPEATABLE-INPUT');

    expect(second.events.map((e) => e.status)).toEqual(
      first.events.map((e) => e.status),
    );
    expect(second.events).toHaveLength(first.events.length);
  });

  it('varies the progression length across different inputs', async () => {
    const lengths = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const result = await adapter.trackShipment(`TRACKING-NUMBER-${i}`);
      lengths.add(result.events.length);
    }
    expect(lengths.size).toBeGreaterThan(1);
  });

  it('returns identical event timestamps across calls within the same day (regression: cache-expiry refetch must not fabricate a new event)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T02:00:00.000Z'));
    const first = await adapter.trackShipment('SAME-DAY-INPUT');

    jest.setSystemTime(new Date('2026-06-15T20:00:00.000Z'));
    const second = await adapter.trackShipment('SAME-DAY-INPUT');

    expect(second.events).toEqual(first.events);
    jest.useRealTimers();
  });

  it('shifts event timestamps once the anchor day changes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    const day1 = await adapter.trackShipment('CROSS-DAY-INPUT');

    jest.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));
    const day2 = await adapter.trackShipment('CROSS-DAY-INPUT');

    expect(
      day2.events[day2.events.length - 1].eventTime.getTime(),
    ).toBeGreaterThan(day1.events[day1.events.length - 1].eventTime.getTime());
    jest.useRealTimers();
  });
});
