export const SHIPMENT_TYPES = ["DOCUMENT", "PARCEL", "PACKAGE", "OTHER"] as const;
export type ShipmentTypeCode = (typeof SHIPMENT_TYPES)[number];

export const FULFILLMENT_METHODS = ["PICKUP", "WAREHOUSE_DROP_OFF"] as const;
export type FulfillmentMethodCode = (typeof FULFILLMENT_METHODS)[number];

// No automated pricing engine exists yet — every quote needs a staff-entered price regardless
// of status. SUBMITTED vs NEEDS_MANUAL_REVIEW is purely informational until a real pricing
// engine can auto-quote the SUBMITTED ones.
export const QUOTE_STATUSES = [
  "SUBMITTED",
  "NEEDS_MANUAL_REVIEW",
  "QUOTED",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
] as const;
export type QuoteStatusCode = (typeof QUOTE_STATUSES)[number];

export const QUOTE_REVIEW_REASONS = [
  "OVERSIZED",
  "DANGEROUS_GOODS",
  "RESTRICTED_DESTINATION",
  "SPECIAL_HANDLING",
  "MISCELLANEOUS",
] as const;
export type QuoteReviewReasonCode = (typeof QUOTE_REVIEW_REASONS)[number];

export const PICKUP_TIME_SLOTS = ["09:00-12:00", "12:00-15:00", "15:00-18:00"] as const;
export type PickupTimeSlot = (typeof PICKUP_TIME_SLOTS)[number];

export interface QuoteAddressDto {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface QuoteOriginAddressDto extends QuoteAddressDto {
  instructions: string | null;
}

export interface QuoteDto {
  id: string;
  customerId: string;
  shipmentType: ShipmentTypeCode;
  weightKg: number;
  description: string | null;
  origin: QuoteOriginAddressDto;
  destination: QuoteAddressDto;
  fulfillmentMethod: FulfillmentMethodCode;
  pickupDate: string | null; // ISO 8601 date-only
  pickupTimeSlot: PickupTimeSlot | null;
  status: QuoteStatusCode;
  reviewReason: QuoteReviewReasonCode | null;
  quotedAmount: number | null;
  quotedCurrency: string | null;
  quotedAt: string | null; // ISO 8601
  rejectionReason: string | null;
  orderId: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// Staff-facing view only — internalNotes and quotedByAdminEmail are deliberately excluded from
// QuoteDto so a customer response can never leak them.
export interface QuoteAdminDetailDto extends QuoteDto {
  internalNotes: string | null;
  quotedByAdminEmail: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
}

export interface CreateQuoteDto {
  shipmentType: ShipmentTypeCode;
  weightKg: number;
  description?: string;
  origin: QuoteOriginAddressDto;
  destination: QuoteAddressDto;
  fulfillmentMethod: FulfillmentMethodCode;
  pickupDate?: string; // ISO 8601 date-only, required when fulfillmentMethod === "PICKUP"
  pickupTimeSlot?: PickupTimeSlot;
  submissionKey: string;
}

export interface ManualQuoteDto {
  amount: number;
  currency?: string;
  internalNotes?: string;
}

export interface RejectQuoteDto {
  reason: string;
}
