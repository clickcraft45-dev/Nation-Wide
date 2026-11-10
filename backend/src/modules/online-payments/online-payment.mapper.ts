import type { Prisma, OnlinePayment } from '@prisma/client';
import type {
  AdminOnlinePaymentDto,
  OnlinePaymentDto,
} from '@nationwide/shared-types';

export const withOrderForAdmin = {
  include: {
    customer: { select: { name: true, phone: true } },
    reviewedBy: { select: { name: true, email: true } },
    order: {
      select: {
        dueAmount: true,
        paymentStatus: true,
        shipments: {
          select: { internalTrackingNumber: true },
          orderBy: { createdAt: 'asc' as const },
          take: 1,
        },
      },
    },
  },
};
export type OnlinePaymentForAdmin = Prisma.OnlinePaymentGetPayload<
  typeof withOrderForAdmin
>;

// The customer-facing shape leaves out the gateway's ids and the office's review notes: neither
// is the customer's business, and a note may say things about them that were never meant to be read.
export function toOnlinePaymentDto(payment: OnlinePayment): OnlinePaymentDto {
  return {
    id: payment.id,
    orderId: payment.orderId,
    amount: payment.amountPaise / 100,
    status: payment.status,
    utr: payment.utr,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

export function toAdminOnlinePaymentDto(
  payment: OnlinePaymentForAdmin,
): AdminOnlinePaymentDto {
  return {
    ...toOnlinePaymentDto(payment),
    customerName: payment.customer.name,
    customerPhone: payment.customer.phone,
    trackingNumber: payment.order.shipments[0]?.internalTrackingNumber ?? null,
    orderDueAmount: payment.order.dueAmount ?? null,
    orderPaymentStatus: payment.order.paymentStatus,
    gatewayPaymentId: payment.gatewayPaymentId,
    note: payment.note,
    reviewedByAdminName:
      payment.reviewedBy?.name ?? payment.reviewedBy?.email ?? null,
    reviewedAt: payment.reviewedAt ? payment.reviewedAt.toISOString() : null,
    reviewNote: payment.reviewNote,
  };
}
