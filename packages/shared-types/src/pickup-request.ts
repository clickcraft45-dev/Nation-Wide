import type { ShipmentTypeCode, PickupTimeSlot } from "./quote";
import type { PaymentMethodCode } from "./order";

// The new pre-order self-service record — created once a customer has picked a carrier and
// submitted pickup logistics, and lives entirely BEFORE any Order exists. Assigned to a
// PICKUP_PARTNER, who physically verifies the parcel, collects payment, and either accepts
// (generating the real Order) or rejects it.
export const PICKUP_REQUEST_STATUSES = [
  "PENDING_ASSIGNMENT",
  "ASSIGNED",
  "SCHEDULED",
  "OUT_FOR_PICKUP",
  "VERIFICATION_PENDING",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
] as const;
export type PickupRequestStatusCode = (typeof PICKUP_REQUEST_STATUSES)[number];

export interface PickupPartnerDto {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string; // ISO 8601
}

export interface CreatePickupPartnerDto {
  email: string;
  password: string;
  name?: string;
  phone?: string;
}

export interface UpdatePickupPartnerDto {
  name?: string;
  phone?: string;
  isActive?: boolean;
}

// The customer-entered "Pickup Request page" fields — deliberately no destination address, since
// that's already known from the quote. quoteId must reference a quote the customer owns, in
// PENDING_PICKUP_REQUEST status.
export interface CreatePickupRequestDto {
  quoteId: string;
  dropAtWarehouse: boolean;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupAddressLine1: string;
  pickupAddressLine2?: string;
  pickupCity: string;
  pickupState: string;
  pickupPostalCode: string;
  // Required unless dropAtWarehouse is true.
  pickupDate?: string; // ISO 8601 date-only
  pickupTimeSlot?: PickupTimeSlot;
  pickupInstructions?: string;
}

export interface PickupRequestDto {
  id: string;
  quoteId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;

  // Null when the underlying quote came from the manual-quote flow (a staff-entered price with
  // no specific carrier attached) — recalculate()/verify() fall back to an unfiltered pricing
  // engine re-run in that case.
  rateProviderId: string | null;
  rateProviderName: string | null;
  shipmentType: ShipmentTypeCode;
  estimatedWeightKg: number;
  estimatedPrice: number;
  currency: string;

  dropAtWarehouse: boolean;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupAddressLine1: string;
  pickupAddressLine2: string | null;
  pickupCity: string;
  pickupState: string;
  pickupPostalCode: string;
  pickupDate: string | null; // ISO 8601 date-only
  pickupTimeSlot: PickupTimeSlot | null;
  pickupInstructions: string | null;

  // Destination — read off the underlying Quote, shown for the partner's own reference (they
  // never edit it here).
  destCity: string;
  destState: string;
  destCountry: string;

  status: PickupRequestStatusCode;

  assignedPartnerId: string | null;
  assignedPartnerName: string | null;
  assignedAt: string | null; // ISO 8601

  // Set when the partner confirms they're physically at the pickup location — required before
  // verifiedAt can be set (see VerifyPickupRequestDto / PickupRequestsService.verify).
  arrivedAt: string | null; // ISO 8601

  verifiedWeightKg: number | null;
  verifiedShipmentType: ShipmentTypeCode | null;
  verifiedPrice: number | null;
  verificationNotes: string | null;
  verifiedAt: string | null; // ISO 8601

  paymentMethod: PaymentMethodCode | null;
  collectedAmount: number | null;
  paymentReference: string | null;
  paymentNotes: string | null;
  paymentCollectedAt: string | null; // ISO 8601

  parcelPackedProperly: boolean | null;
  weightVerifiedFlag: boolean | null;
  restrictedItemsChecked: boolean | null;
  documentsVerified: boolean | null;
  isFragile: boolean | null;
  insuranceRequired: boolean | null;
  acceptanceRemarks: string | null;

  rejectionReason: string | null;
  orderId: string | null;

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface QueryPickupRequestsDto {
  status?: PickupRequestStatusCode;
  search?: string;
}

export interface AssignPartnerDto {
  partnerId: string;
}

// Stateless pricing preview — nothing persisted. Mirrors GET /quotes/preview.
export interface RecalculateWeightDto {
  weightKg: number;
  shipmentType: ShipmentTypeCode;
}

export interface RecalculatePreviewDto {
  estimatedPrice: number;
  recalculatedPrice: number | null; // null when no rate matches the corrected weight/shipmentType
  difference: number | null;
  currency: string;
}

// Persists the verification — the server re-runs the pricing engine itself from these inputs
// rather than trusting a client-echoed price from the recalculate preview.
export interface VerifyPickupRequestDto {
  verifiedWeightKg: number;
  verifiedShipmentType: ShipmentTypeCode;
  verificationNotes?: string;
}

export interface CollectPaymentDto {
  paymentMethod: PaymentMethodCode;
  collectedAmount: number;
  paymentReference?: string;
  paymentNotes?: string;
}

export interface AcceptParcelDto {
  parcelPackedProperly: boolean;
  weightVerifiedFlag: boolean;
  restrictedItemsChecked: boolean;
  documentsVerified: boolean;
  isFragile: boolean;
  insuranceRequired: boolean;
  acceptanceRemarks?: string;
}

export interface RejectParcelDto {
  reason: string;
}

export interface PickupPartnerDashboardSummaryDto {
  todayPickups: number;
  tomorrowPickups: number;
  pendingPickups: number;
  completedToday: number;
  collectionsToday: number;
  cashCollectedToday: number;
  upiCollectedToday: number;
  totalStops: number;
}
