import type { RateQuoteOptionDto } from "./pricing";

export const SHIPMENT_TYPES = ["DOCUMENT", "PARCEL", "PACKAGE", "OTHER"] as const;
export type ShipmentTypeCode = (typeof SHIPMENT_TYPES)[number];

export const FULFILLMENT_METHODS = ["PICKUP", "WAREHOUSE_DROP_OFF"] as const;
export type FulfillmentMethodCode = (typeof FULFILLMENT_METHODS)[number];

// The pricing engine auto-computes RATED options for most requests at creation time — see
// PricingEngineService. NEEDS_MANUAL_REVIEW is the fallback for shipment types it can't touch
// (OTHER/oversized) or destinations with no active rate card (NO_RATE_AVAILABLE); those still
// get a staff-entered price via the manual-quote flow. SUBMITTED only appears on pre-existing
// rows created before the engine shipped.
export const QUOTE_STATUSES = [
  "SUBMITTED",
  "RATED",
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
  "NO_RATE_AVAILABLE",
] as const;
export type QuoteReviewReasonCode = (typeof QUOTE_REVIEW_REASONS)[number];

export const PICKUP_TIME_SLOTS = ["09:00-12:00", "12:00-15:00", "15:00-18:00"] as const;
export type PickupTimeSlot = (typeof PICKUP_TIME_SLOTS)[number];

// Customer-facing option shape — deliberately excludes baseRate/pssAmount/fuelChargePercent/
// gstPercent/nationwideCut and every other internal breakdown field. The full breakdown
// (RateQuoteOptionDto, from pricing.ts) is admin-only, see QuoteAdminDetailDto.
export interface CustomerRateQuoteOptionDto {
  id: string;
  rateProviderId: string;
  rateProviderName: string;
  currency: string;
  finalPrice: number;
  createdAt: string; // ISO 8601
}

// GET /quotes/preview — a stateless calculation only, nothing persisted. Same exclusion of
// internal breakdown fields as CustomerRateQuoteOptionDto, minus the id/createdAt that only
// exist once an option is actually saved against a Quote.
export interface QuotePreviewOptionDto {
  rateProviderId: string;
  rateProviderName: string;
  currency: string;
  finalPrice: number;
}

export interface QuotePreviewResultDto {
  status: "RATED" | "NEEDS_MANUAL_REVIEW";
  reviewReason: QuoteReviewReasonCode | null;
  options: QuotePreviewOptionDto[];
}

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
  // Populated only while status === "RATED" — the pricing engine's computed comparison options.
  // Slim, customer-safe shape — see CustomerRateQuoteOptionDto's doc comment.
  rateQuoteOptions: CustomerRateQuoteOptionDto[];
  selectedOption: CustomerRateQuoteOptionDto | null;
  optionsExpireAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// Staff-facing view only — internalNotes and quotedByAdminEmail are deliberately excluded from
// QuoteDto so a customer response can never leak them. Also restores the full pricing breakdown
// on rateQuoteOptions/selectedOption (base rate, PSS, fuel charge, GST, NationWide's margin) —
// admin-only, per the customer quote flow's "internal pricing must stay backend/admin-side" rule.
export interface QuoteAdminDetailDto extends Omit<QuoteDto, "rateQuoteOptions" | "selectedOption"> {
  rateQuoteOptions: RateQuoteOptionDto[];
  selectedOption: RateQuoteOptionDto | null;
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

// Admin "Get a Quote" — staff-initiated quote creation on a customer's behalf, e.g. a phone-in
// request. Identical to CreateQuoteDto plus the target customer, since there's no customer JWT
// subject to imply it from (see AdminQuotesController.create).
export interface CreateAdminQuoteDto extends CreateQuoteDto {
  customerId: string;
}

export interface ManualQuoteDto {
  amount: number;
  currency?: string;
  internalNotes?: string;
}

export interface RejectQuoteDto {
  reason: string;
}

export interface SelectOptionDto {
  optionId: string;
}
