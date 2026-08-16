import type { OrderDto } from '@nationwide/shared-types';
import type { OrderWithShipments } from './orders.service';

// The DTO boundary orders.controller.ts/admin-orders.controller.ts were missing — without this,
// every list/detail response returned the raw Prisma entity, which includes
// paymentMarkedByAdminId (an internal admin-user id) with no review point stopping a future
// schema addition (e.g. an internal cost/margin column) from silently leaking to customers.
export function toOrderDto(order: OrderWithShipments): OrderDto {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    quoteId: order.quote?.id ?? null,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    paidAmount: order.paidAmount ? order.paidAmount.toNumber() : null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    shipments: order.shipments.map((s) => ({
      id: s.id,
      internalTrackingNumber: s.internalTrackingNumber,
      providerId: s.providerId,
      currentStatus: s.currentStatus,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}
