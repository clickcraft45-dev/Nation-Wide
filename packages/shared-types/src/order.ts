export const ORDER_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"] as const;

export type OrderStatusCode = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export type PaymentStatusCode = (typeof PAYMENT_STATUSES)[number];

// RAZORPAY is reserved, unused until a real gateway is integrated.
export const PAYMENT_METHODS = ["CASH", "UPI", "BANK_TRANSFER", "RAZORPAY"] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number];

export interface ShipmentSummaryDto {
  id: string;
  internalTrackingNumber: string;
  providerId: string;
  currentStatus: string | null;
  createdAt: string; // ISO 8601
  /**
   * The carrier's AWB for this shipment, once an admin has mapped one. Null means unmapped —
   * the order exists but has no number a customer could track with yet, which is exactly what
   * the admin Orders list's mapped/unmapped filter splits on.
   */
  externalTrackingNumber: string | null;
}

export interface OrderDto {
  id: string;
  customerId: string;
  /**
   * The customer's display name, joined server-side. Present so a list view can label its rows
   * without downloading the entire customer table to build an id->name map client-side, which is
   * what the admin dashboard used to do.
   */
  customerName: string | null;
  status: OrderStatusCode;
  quoteId: string | null;
  paymentStatus: PaymentStatusCode;
  paymentMethod: PaymentMethodCode | null;
  paidAmount: number | null;
  paidAt: string | null; // ISO 8601
  /** Who handed the money over, and anything worth recording about how it was paid. */
  paymentPayerName: string | null;
  paymentNote: string | null;
  /** Money sent back. Recorded rather than inferred: partial refunds are normal. */
  refundedAmount: number | null;
  refundedAt: string | null; // ISO 8601
  refundNote: string | null;

  /** The coupon that was applied, and the rupees it took off. Both null when none was used. */
  couponCode: string | null;
  discountAmount: number | null;

  /**
   * What the customer still owes on a parcel that was taken on a "pay later" approval, and the
   * admin who approved it. Null on every order that was paid at the door or is simply unpaid —
   * a due is an approved deferral, not just an absence of money.
   */
  dueAmount: number | null;
  dueApprovedByAdminName: string | null;

  /**
   * When the parcel itself came back, for an order that was called off. Independent of the
   * refund: money and goods move separately, and holding the goods after refunding is normal.
   */
  returnedAt: string | null; // ISO 8601
  returnNote: string | null;
  cancelledAt: string | null; // ISO 8601
  cancellationReason: string | null;
  /** The fee actually charged, frozen at cancellation time. */
  cancellationFee: number | null;
  cancellationDistanceKm: number | null;
  /** Whether that distance was driven along roads, or the straight line used as a fallback. */
  cancellationDistanceSource: "road" | "straight-line" | null;
  /**
   * Whether the customer may still cancel this themselves: an order is theirs to call off until
   * an AWB has been mapped, after which the carrier holds the parcel and it is a support matter.
   */
  isCancellableByCustomer: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /**
   * Where the parcel is going out from and where it is headed, as display labels for list views
   * ("New Delhi, India"). Assembled server-side because the two customer flows keep the route in
   * different places: an admin manual quote carries the full origin and destination addresses,
   * while the self-service flow moves pickup logistics onto the PickupRequest and leaves the
   * quote's origin columns null. Null only when neither record exists yet.
   */
  origin: string | null;
  destination: string | null;
  shipments: ShipmentSummaryDto[];
}

export interface UpdateOrderPaymentDto {
  paymentStatus: PaymentStatusCode;
  paymentMethod?: PaymentMethodCode;
  paidAmount?: number;
  /** A discount code to apply; the server validates it and records what it took off. */
  couponCode?: string;
  /** Who paid, and a free-text note — both kept on PAID. */
  paymentPayerName?: string;
  paymentNote?: string;
  /** How much went back, on REFUNDED. */
  refundedAmount?: number;
  refundNote?: string;
}

/** What cancelling now would cost, so the customer sees it before confirming. */
export interface CancellationQuoteDto {
  isCancellable: boolean;
  /** Why not, when it is not: an AWB is mapped, or the order is already closed. */
  reason: string | null;
  baseFee: number;
  perKmFee: number;
  distanceKm: number | null;
  /**
   * How the distance was measured. "road" is the driving route; "straight-line" means the
   * routing engine could not be reached, which the customer is told before they confirm.
   */
  distanceSource: "road" | "straight-line" | null;
  totalFee: number;
}

export interface CancelOrderDto {
  reason?: string;
}
