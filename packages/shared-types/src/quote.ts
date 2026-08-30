import type { RateQuoteOptionDto } from "./pricing";

export const SHIPMENT_TYPES = ["DOCUMENT", "PARCEL", "PACKAGE", "OTHER"] as const;
export type ShipmentTypeCode = (typeof SHIPMENT_TYPES)[number];

export const FULFILLMENT_METHODS = ["PICKUP", "WAREHOUSE_DROP_OFF"] as const;
export type FulfillmentMethodCode = (typeof FULFILLMENT_METHODS)[number];

// The pricing engine auto-computes RATED options for most requests at creation time — see
// PricingEngineService. NEEDS_MANUAL_REVIEW is now reserved for the two cases a human genuinely
// has to look at before anyone is dispatched: an "Other" shipment type and anything over the
// oversized weight threshold. A destination with no active rate card (NO_RATE_AVAILABLE) does
// NOT wait for review any more — it goes straight to PENDING_PICKUP_REQUEST, a partner is
// auto-assigned, and the partner prices it from the verified weight at the door; reviewReason
// stays set as the only record of why that quote carries no amount. SUBMITTED only appears on
// pre-existing
// rows created before the engine shipped. PENDING_PICKUP_REQUEST / PICKUP_REQUESTED are the new
// customer self-service pre-order states — see pickup-request.ts — reached instead of ACCEPTED
// when the quote has no fulfillmentMethod set (the legacy admin manual-quote path, which always
// sets fulfillmentMethod, still goes straight to ACCEPTED as before).
export const QUOTE_STATUSES = [
  "SUBMITTED",
  "RATED",
  "NEEDS_MANUAL_REVIEW",
  "QUOTED",
  "PENDING_PICKUP_REQUEST",
  "PICKUP_REQUESTED",
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
  /**
   * PENDING_PICKUP_REQUEST means "we have no rate card for this, so it will be priced at pickup"
   * — the request proceeds with a partner assigned, it does not wait on staff.
   * NEEDS_MANUAL_REVIEW is reserved for the two cases a human genuinely has to look at first:
   * an "Other" shipment type and anything over the oversized weight threshold.
   */
  status: "RATED" | "NEEDS_MANUAL_REVIEW" | "PENDING_PICKUP_REQUEST";
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
  // Null on the new customer self-service flow — pickup logistics live on PickupRequest instead
  // (see pickup-request.ts). Still populated by the legacy admin manual-quote flow.
  origin: QuoteOriginAddressDto | null;
  destination: QuoteAddressDto;
  fulfillmentMethod: FulfillmentMethodCode | null;
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
  destination: QuoteAddressDto;
  // Optional — omitted by the new customer self-service wizard, which collects pickup logistics
  // later via CreatePickupRequestDto (see pickup-request.ts) instead of at quote-creation time.
  // The admin manual-quote flow (CreateAdminQuoteDto) still always supplies these.
  origin?: QuoteOriginAddressDto;
  fulfillmentMethod?: FulfillmentMethodCode;
  pickupDate?: string; // ISO 8601 date-only, required when fulfillmentMethod === "PICKUP"
  pickupTimeSlot?: PickupTimeSlot;
  submissionKey: string;
}

// Admin "Get a Quote" — staff-initiated quote creation on a customer's behalf, e.g. a phone-in
// request. Identical to CreateQuoteDto plus the target customer, since there's no customer JWT
// subject to imply it from (see AdminQuotesController.create). Unlike the customer self-service
// wizard, this flow still collects full logistics upfront — re-required here (CreateQuoteDto
// itself made them optional for the new pickup-request flow) so staff always supply them, which
// is also what keeps Quote.fulfillmentMethod set and this whole path on the legacy
// immediate-order-creation behavior — see QuotesService.selectOption/acceptQuote.
export interface CreateAdminQuoteDto
  extends Omit<CreateQuoteDto, "origin" | "fulfillmentMethod">,
    Required<Pick<CreateQuoteDto, "origin" | "fulfillmentMethod">> {
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
