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
}
