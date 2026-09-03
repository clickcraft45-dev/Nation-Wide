import { toOrderDto } from './order.mapper';
import type { OrderWithShipments } from './orders.service';

// The admin Orders table showed a literal em-dash in its Origin and Destination columns for every
// row, with a footnote claiming the data was never captured. It was: an admin manual quote stores
// the whole origin/destination address on the Quote, and the self-service flow stores the pickup
// location on the PickupRequest instead. These cover both flows and the gap between them.

const base = {
  id: 'order-1',
  customerId: 'cust-1',
  status: 'CONFIRMED',
  paymentStatus: 'PENDING',
  paymentMethod: null,
  paidAmount: null,
  paidAt: null,
  paymentMarkedByAdminId: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  shipments: [],
  quote: null,
  pickupRequest: null,
} as unknown as OrderWithShipments;

function order(
  overrides: Partial<Record<string, unknown>>,
): OrderWithShipments {
  return { ...base, ...overrides };
}

describe('toOrderDto route labels', () => {
  it('reads both ends off the quote on the admin manual-quote flow', () => {
    const dto = toOrderDto(
      order({
        quote: {
          id: 'q-1',
          originCity: 'New Delhi',
          originCountry: 'India',
          destCity: 'Tokyo',
          destCountry: 'Japan',
        },
      }),
    );
    expect(dto.origin).toBe('New Delhi, India');
    expect(dto.destination).toBe('Tokyo, Japan');
  });

  it('falls back to the pickup request for origin when the quote has none', () => {
    const dto = toOrderDto(
      order({
        quote: {
          id: 'q-1',
          originCity: null,
          originCountry: null,
          destCity: 'Dubai',
          destCountry: 'United Arab Emirates',
        },
        pickupRequest: { pickupCity: 'Mumbai', pickupState: 'Maharashtra' },
      }),
    );
    expect(dto.origin).toBe('Mumbai, Maharashtra');
    expect(dto.destination).toBe('Dubai, United Arab Emirates');
  });

  it('keeps whichever half exists rather than printing a stray comma', () => {
    const dto = toOrderDto(
      order({
        quote: {
          id: 'q-1',
          originCity: 'Pune',
          originCountry: null,
          destCity: null,
          destCountry: 'Germany',
        },
      }),
    );
    expect(dto.origin).toBe('Pune');
    expect(dto.destination).toBe('Germany');
  });

  it('is null — not an empty string — when an order has neither record yet', () => {
    const dto = toOrderDto(order({}));
    expect(dto.origin).toBeNull();
    expect(dto.destination).toBeNull();
  });

  it('treats a blank-but-present field as missing', () => {
    const dto = toOrderDto(
      order({
        quote: {
          id: 'q-1',
          originCity: '  ',
          originCountry: '',
          destCity: '',
          destCountry: '  ',
        },
      }),
    );
    expect(dto.origin).toBeNull();
    expect(dto.destination).toBeNull();
  });
});
