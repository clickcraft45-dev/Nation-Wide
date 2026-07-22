// Types for domains that don't have a real backend yet (Payments, Pickups, Quotes,
// Shipment Requests). Deliberately kept out of @nationwide/shared-types until the real
// business logic and Prisma models exist — these shapes are provisional. Every list/detail
// page built against these should only ever call the functions in `lib/mock-data.ts`, so
// swapping in real endpoints later is a one-file change, not a UI rewrite.

export type PaymentStatus = "PENDING" | "PAID" | "CANCELLED";
export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER";

export interface PaymentRecord {
  id: string;
  orderId: string;
  customerName: string;
  amount: number;
  currency: "INR";
  method: PaymentMethod | null;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

export type PickupStatus = "PENDING" | "COMPLETED" | "RESCHEDULED";

export interface PickupRecord {
  id: string;
  orderId: string;
  customerName: string;
  address: string;
  date: string;
  timeSlot: string;
  status: PickupStatus;
  assignedManagerEmail: string | null;
  weightVerifiedKg: number | null;
  notes: string | null;
}

export type QuoteStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type QuoteReviewReason =
  | "DANGEROUS_GOODS"
  | "OVERSIZED"
  | "RESTRICTED_DESTINATION"
  | "SPECIAL_HANDLING"
  | null;

export interface QuoteRequest {
  id: string;
  customerName: string;
  origin: string;
  destination: string;
  weightKg: number;
  reviewReason: QuoteReviewReason;
  status: QuoteStatus;
  quotedAmount: number | null;
  createdAt: string;
}

export type ShipmentRequestStatus = "NEW" | "IN_REVIEW" | "CONVERTED" | "DECLINED";

export interface ShipmentRequest {
  id: string;
  customerName: string;
  requestedService: string;
  status: ShipmentRequestStatus;
  createdAt: string;
}
