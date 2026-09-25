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
    customerName: order.customer?.name ?? null,
    status: order.status,
    quoteId: order.quote?.id ?? null,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    paidAmount: order.paidAmount ? order.paidAmount : null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    paymentPayerName: order.paymentPayerName,
    paymentNote: order.paymentNote,
    refundedAmount: order.refundedAmount ?? null,
    refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
    refundNote: order.refundNote,
    couponCode: order.coupon?.code ?? null,
    discountAmount: order.discountAmount ?? null,
    dueAmount: order.dueAmount ?? null,
    dueApprovedByAdminName: order.dueApprovedBy?.name ?? null,
    returnedAt: order.returnedAt ? order.returnedAt.toISOString() : null,
    returnNote: order.returnNote,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    cancellationReason: order.cancellationReason,
    cancellationFee: order.cancellationFee ?? null,
    cancellationDistanceKm: order.cancellationDistanceKm ?? null,
    cancellationDistanceSource:
      (order.cancellationDistanceSource as 'road' | 'straight-line' | null) ??
      null,
    // The AWB is the cutoff: once a carrier has the parcel, cancelling is a support matter, so
    // the button is not offered rather than offered and then refused.
    isCancellableByCustomer:
      order.status !== 'CANCELLED' &&
      order.status !== 'COMPLETED' &&
      order.shipments.every((s) => s.externalTrackingNumbers.length === 0),
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
      // The mapping for the shipment's own provider. A shipment can carry numbers for several
      // providers (one per leg), but the one a customer tracks with is the current provider's.
      externalTrackingNumber:
        s.externalTrackingNumbers.find((e) => e.providerId === s.providerId)
          ?.externalTrackingNumber ?? null,
    })),
  };
}
