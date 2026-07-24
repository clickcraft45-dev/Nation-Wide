import { formatInternalTrackingNumber } from './tracking-number';

describe('formatInternalTrackingNumber', () => {
  it('formats a 2-digit year and zero-pads the sequence to 8 digits', () => {
    expect(
      formatInternalTrackingNumber(42, new Date('2026-07-24T00:00:00.000Z')),
    ).toBe('NW-26-00000042');
  });

  it('does not truncate a sequence number wider than the padding width', () => {
    expect(
      formatInternalTrackingNumber(123456789, new Date('2026-01-01T00:00:00.000Z')),
    ).toBe('NW-26-123456789');
  });

  it('uses the UTC year of createdAt, not the local year', () => {
    expect(
      formatInternalTrackingNumber(1, new Date('2030-12-31T23:59:59.000Z')),
    ).toBe('NW-30-00000001');
  });
});
