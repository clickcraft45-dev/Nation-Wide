import type { OrderDto } from '@nationwide/shared-types';
import type { OrderWithShipments } from './orders.service';

// The DTO boundary orders.controller.ts/admin-orders.controller.ts were missing — without this,
// every list/detail response returned the raw Prisma entity, which includes
// paymentMarkedByAdminId (an internal admin-user id) with no review point stopping a future
// schema addition (e.g. an internal cost/margin column) from silently leaking to customers.

// "New Delhi, India" from its parts, skipping whichever is missing, and null if both are.
// Keeping the join here rather than in each table cell means the customer portal and the admin
// console cannot drift into formatting the same route two different ways.
function placeLabel(
  city?: string | null,
  region?: string | null,
): string | null {
  const parts = [city, region].filter((p): p is string => Boolean(p?.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function toOrderDto(order: OrderWithShipments): OrderDto {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    quoteId: order.quote?.id ?? null,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    paidAmount: order.paidAmount ? order.paidAmount : null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    // Origin lives on the quote for an admin manual quote and on the pickup request for the
    // self-service flow; whichever this order came through is the one that is populated.
    origin:
      placeLabel(order.quote?.originCity, order.quote?.originCountry) ??
      placeLabel(
        order.pickupRequest?.pickupCity,
        order.pickupRequest?.pickupState,
      ),
    destination: placeLabel(order.quote?.destCity, order.quote?.destCountry),
    shipments: order.shipments.map((s) => ({
      id: s.id,
      internalTrackingNumber: s.internalTrackingNumber,
      providerId: s.providerId,
      currentStatus: s.currentStatus,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}
