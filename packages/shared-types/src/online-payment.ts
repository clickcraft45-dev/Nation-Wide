/**
 * Where one online payment attempt stands.
 *
 * CREATED, FAILED, EXPIRED and CANCELLED describe the checkout. OBSERVED, RECONCILED and
 * MANUAL_REVIEW are what the gateway reports about the money, and none of them is proof of it:
 * the gateway reads bank alerts. CONFIRMED and REJECTED are the office's decision after checking
 * the bank account, and only CONFIRMED marks the order paid.
 */
export const ONLINE_PAYMENT_STATUSES = [
  "CREATED",
  "OBSERVED",
  "RECONCILED",
  "MANUAL_REVIEW",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "CONFIRMED",
  "REJECTED",
] as const;
export type OnlinePaymentStatusCode = (typeof ONLINE_PAYMENT_STATUSES)[number];

/** The states in which the gateway says money moved and an admin has not yet ruled on it. */
export const ONLINE_PAYMENT_AWAITING_REVIEW: readonly OnlinePaymentStatusCode[] = [
  "OBSERVED",
  "RECONCILED",
  "MANUAL_REVIEW",
];

export interface OnlinePaymentDto {
  id: string;
  orderId: string;
  /** Rupees. */
  amount: number;
  status: OnlinePaymentStatusCode;
  /** The bank reference the gateway read off the credit alert, once there is one. */
  utr: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** What the customer portal needs to decide whether to offer "Pay now" on each order. */
export interface MyOnlinePaymentsDto {
  /** False when no gateway is configured on this deployment; the button is then not shown. */
  enabled: boolean;
  /** The latest attempt per order, for orders that have one. */
  payments: OnlinePaymentDto[];
}

export interface OnlineCheckoutDto {
  paymentId: string;
  /** The gateway's hosted checkout page. The browser is sent there. */
  checkoutUrl: string;
}

/** An attempt as the admin console lists it: the claim, and enough of the order to check it. */
export interface AdminOnlinePaymentDto extends OnlinePaymentDto {
  customerName: string | null;
  customerPhone: string | null;
  trackingNumber: string | null;
  /** What the order still owes right now, which may differ from what this attempt was for. */
  orderDueAmount: number | null;
  orderPaymentStatus: string;
  gatewayPaymentId: string | null;
  note: string | null;
  reviewedByAdminName: string | null;
  reviewedAt: string | null; // ISO 8601
  reviewNote: string | null;
}

export interface RejectOnlinePaymentDto {
  /** Why the money is not being accepted, e.g. "no credit for this UTR in the statement". */
  note: string;
}
