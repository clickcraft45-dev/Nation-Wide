import type { ShipmentTypeCode, PickupTimeSlot } from "./quote";
import type { PaymentMethodCode } from "./order";
import type { ParcelPackageDto, ShipmentItemDto } from "./parcel";

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
  /** Where the partner's phone last reported from: every few minutes while the app is open. */
  lastLatitude: number | null;
  lastLongitude: number | null;
  locationUpdatedAt: string | null; // ISO 8601
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
  /** The dropped pin, when the customer set one on the map. */
  pickupLatitude?: number;
  pickupLongitude?: number;
  // Required unless dropAtWarehouse is true.
  pickupDate?: string; // ISO 8601 date-only
  pickupTimeSlot?: PickupTimeSlot;
  pickupInstructions?: string;
  /** Required: carriers will not move a parcel without declared contents. */
  items: ShipmentItemDto[];
  /** Must be true — the server rejects a request that doesn't accept the carriage terms. */
  acceptedTerms: true;
}

/** Staff booking a pickup on a customer's behalf, assigned straight to a partner. */
export interface AdminCreatePickupOrderDto {
  customerId: string;
  submissionKey: string;
  shipmentType: ShipmentTypeCode;
  packages: ParcelPackageDto[];
  items: ShipmentItemDto[];
  destinationCountry: string;
  recipient: Omit<PickupRecipientDto, "addressLine2"> & { addressLine2?: string };
  pickupContactName: string;
  pickupContactPhone: string;
  pickupAddressLine1: string;
  pickupAddressLine2?: string;
  pickupCity: string;
  pickupState: string;
  pickupPostalCode: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupMapsUrl?: string;
  pickupDate: string;
  pickupTimeSlot: PickupTimeSlot;
  pickupInstructions?: string;
  /** The carrier picked from the price preview. Omit and give manualPrice when none is rated. */
  rateProviderId?: string;
  manualPrice?: number;
  partnerId: string;
}

export interface ResolvedMapsUrlDto {
  latitude: number | null;
  longitude: number | null;
}

/** A place to put the pickup pin: a building entrance, or a point a vehicle can stop at. */
export interface PickupSpotDto {
  kind: "ENTRANCE" | "STOP";
  label: string;
  /** Google's preferred entrance for the building; the pin snaps to it. */
  preferred: boolean;
  latitude: number;
  longitude: number;
}

/** The building at a pin: its outline and ways in. Empty when Google has no data for the spot. */
export interface PickupSpotsDto {
  buildingName: string | null;
  outline: { latitude: number; longitude: number }[] | null;
  spots: PickupSpotDto[];
}

/** The identity documents a shipper can be verified with, as customs and the carriers accept them. */
export const KYC_DOCUMENT_TYPES = [
  "AADHAAR",
  "GSTIN",
  "PAN",
  "PASSPORT",
  "TAN",
  "VAT",
  "VOTER_ID",
] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export const KYC_DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  AADHAAR: "Aadhaar Number",
  GSTIN: "GSTIN (Normal)",
  PAN: "PAN Number",
  PASSPORT: "Passport Number",
  TAN: "TAN Number",
  VAT: "VAT",
  VOTER_ID: "Voter ID",
};

/** The shipper's identity document: which one, and its number. Set at the door, reused after. */
export interface KycDocumentDto {
  type: KycDocumentType;
  number: string;
}

export const PICKUP_PHOTO_KINDS = ["KYC", "PARCEL", "PAYMENT"] as const;
export type PickupPhotoKind = (typeof PICKUP_PHOTO_KINDS)[number];

/** Most photos one upload may carry, and the most a document or parcel may hold in all. */
export const MAX_PHOTOS_PER_UPLOAD = 10;
export const MAX_PHOTOS_PER_KIND = 20;

/** One stored photo. The image itself is never embedded: see PickupDocumentsDto. */
export interface PickupPhotoDto {
  id: string;
  kind: PickupPhotoKind;
  /** What it shows, e.g. "Front", "Back", "Box 2 label". */
  label: string;
  createdAt: string; // ISO 8601
}

/** Short-lived links to the KYC/parcel photos — only ever fetched on demand, never embedded. */
export interface PickupDocumentsDto {
  photos: (PickupPhotoDto & { url: string | null })[];
}

export interface PickupRecipientDto {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
}

/** Where a customer pays by UPI at the door or the counter. Null fields: not set up by admin yet. */
export interface PaymentUpiDto {
  upiId: string | null;
  payeeName: string | null;
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

  /**
   * The discount code the customer applied when booking, and the rupees it takes off. The amount
   * is frozen at booking — a code can be retired or re-priced before the parcel is collected,
   * and this is the figure the customer was shown.
   */
  couponCode: string | null;
  discountAmount: number | null;
  /** A discount the partner gave at the door, with the admin who approved it. */
  doorDiscount: DoorDiscountDto | null;
  /** What is actually collected at the door: the priced amount less both discounts. */
  payableAmount: number;

  dropAtWarehouse: boolean;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupAddressLine1: string;
  pickupAddressLine2: string | null;
  pickupCity: string;
  pickupState: string;
  pickupPostalCode: string;
  /** Where the customer dropped the pin — null for a typed-in address. */
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  /** A Google Maps link staff pasted when booking; used for navigation when there is no pin. */
  pickupMapsUrl: string | null;
  pickupDate: string | null; // ISO 8601 date-only
  pickupTimeSlot: PickupTimeSlot | null;
  pickupInstructions: string | null;

  // Destination — read off the underlying Quote. City/state are null until the recipient's
  // address has been entered.
  destCity: string | null;
  destState: string | null;
  /** Known before the full address when staff took it while booking. */
  destPostalCode: string | null;
  destCountry: string;
  // The recipient's delivery address; null when the customer left it for the partner to take
  // down at pickup. The partner confirms (or fills) it during verification.
  recipient: PickupRecipientDto | null;
  recipientVerifiedAt: string | null; // ISO 8601

  /** The boxes as booked, and as measured at the door (null until verified). */
  packages: ParcelPackageDto[] | null;
  verifiedPackages: ParcelPackageDto[] | null;
  items: ShipmentItemDto[] | null;
  /** The customer's identity document, kept from an earlier pickup unless changed. */
  kycDocument: KycDocumentDto | null;
  /** Photos of that document: the customer's, so they carry over to later pickups. */
  kycPhotos: PickupPhotoDto[];
  /** Photos of this pickup's parcel. */
  parcelPhotos: PickupPhotoDto[];
  /** Proof of payment taken at the door, e.g. the customer's UPI screen. Optional. */
  paymentPhotos: PickupPhotoDto[];

  status: PickupRequestStatusCode;

  assignedPartnerId: string | null;
  assignedPartnerName: string | null;
  /** The assigned partner's phone — shown to the customer so they can call them. */
  assignedPartnerPhone: string | null;
  assignedAt: string | null; // ISO 8601

  // Set when the partner confirms they're physically at the pickup location — required before
  // verifiedAt can be set (see VerifyPickupRequestDto / PickupRequestsService.verify).
  arrivedAt: string | null; // ISO 8601
  /** The partner said they will do it (status SCHEDULED). Until then they may ask for another day. */
  acceptedAt: string | null; // ISO 8601
  /** The last time the date or slot was moved, by the partner or by staff, and why. */
  rescheduledAt: string | null; // ISO 8601
  rescheduleReason: string | null;
  /** Staff called the pickup off. */
  cancelledAt: string | null; // ISO 8601
  cancellationReason: string | null;

  verifiedWeightKg: number | null;
  verifiedShipmentType: ShipmentTypeCode | null;
  verifiedPrice: number | null;
  verificationNotes: string | null;
  verifiedAt: string | null; // ISO 8601

  /** The method, or the largest part of a split payment. */
  paymentMethod: PaymentMethodCode | null;
  /** The total taken at the door, across every method. */
  collectedAmount: number | null;
  /** Each method's share when the payment was split; null for a single method. */
  paymentSplits: PaymentSplitDto[] | null;
  paymentReference: string | null;
  paymentNotes: string | null;
  paymentCollectedAt: string | null; // ISO 8601
  /**
   * Set instead of paymentCollectedAt when the parcel was taken on a "pay later" approval, with
   * the admin who approved it. The amount owed is the verified price.
   */
  paymentDeferredAt: string | null; // ISO 8601
  paymentDueApprovedByAdminName: string | null;
  paymentDueNote: string | null;

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
  orderId?: string;
}

export interface AssignPartnerDto {
  partnerId: string;
}

// Stateless pricing preview — nothing persisted. Mirrors GET /quotes/preview.
export interface RecalculateWeightDto {
  weightKg: number;
  shipmentType: ShipmentTypeCode;
}

/**
 * One thing that moved between the quote and the price at the door.
 *
 * The parcel is deliberately re-priced against TODAY's rate card, so a tariff, fuel or PSS edit
 * after the quote changes the figure even when the parcel is exactly as described. Saying which
 * component moved, and from what to what, is the difference between a partner who can answer
 * "why is it more?" at the door and one who cannot.
 */
export interface PriceChangeDto {
  label: string;
  /** Formatted for reading, e.g. "18%" or "₹6,000". */
  from: string;
  to: string;
}

export interface RecalculatePreviewDto {
  estimatedPrice: number;
  recalculatedPrice: number | null; // null when no rate matches the corrected weight/shipmentType
  difference: number | null;
  currency: string;
  /** Why the price moved. Empty when nothing did, or when the original breakdown isn't on file. */
  changes: PriceChangeDto[];
}

// Persists the verification — the server re-runs the pricing engine itself from these inputs
// rather than trusting a client-echoed price from the recalculate preview.
export interface VerifyPickupRequestDto {
  /** Measured at the door; the server prices their chargeable weight. */
  packages: ParcelPackageDto[];
  items: ShipmentItemDto[];
  verifiedShipmentType: ShipmentTypeCode;
  /**
   * Only for a pickup with no rate provider — one whose quote could not be priced because no
   * rate card covered it. The server re-prices from its own rate cards everywhere else and
   * rejects this field there rather than letting the client name its own price.
   */
  verifiedPrice?: number;
  verificationNotes?: string;
}

/** One way the customer paid: Rs 2,000 in cash, or Rs 400 by UPI. */
export interface PaymentSplitDto {
  method: PaymentMethodCode;
  amount: number;
  /** The UPI transaction reference, when there is one. */
  reference?: string | null;
}

/** The ways a partner can be paid at the door. */
export const DOOR_PAYMENT_METHODS = ["CASH", "UPI"] as const satisfies readonly PaymentMethodCode[];

export interface DoorDiscountDto {
  amount: number;
  reason: string;
  approvedByAdminName: string | null;
}

/** A discount given at the door. Amount 0 removes one already given. */
export interface ApplyDoorDiscountDto {
  amount: number;
  reason?: string;
  approvedByAdminId?: string;
}

export interface CollectPaymentDto {
  /**
   * How the money was taken: one entry for a single method, two for cash + UPI. Their sum is
   * what was collected.
   */
  payments: PaymentSplitDto[];
  paymentNotes?: string;
}

/** The part of a split total not yet assigned to a method, rounded to the paisa. */
export function splitRemainder(total: number, splits: { amount: number }[]): number {
  const assigned = splits.reduce((sum, s) => sum + (Number.isFinite(s.amount) ? s.amount : 0), 0);
  return Math.round((total - assigned) * 100) / 100;
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

// The shape each document's number takes, so a mistyped digit is caught at the door rather than
// by customs. VAT numbers vary by country, so only their length is checked.
const KYC_NUMBER_PATTERNS: Record<KycDocumentType, RegExp> = {
  AADHAAR: /^\d{12}$/,
  GSTIN: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/,
  PAN: /^[A-Z]{5}\d{4}[A-Z]$/,
  PASSPORT: /^[A-Z][A-Z\d]{6,8}$/,
  TAN: /^[A-Z]{4}\d{5}[A-Z]$/,
  VAT: /^[A-Z\d]{5,20}$/,
  VOTER_ID: /^[A-Z]{3}\d{7}$/,
};

const KYC_NUMBER_HINTS: Record<KycDocumentType, string> = {
  AADHAAR: "12 digits",
  GSTIN: "15 characters, e.g. 36ABCDE1234F1Z5",
  PAN: "10 characters, e.g. ABCDE1234F",
  PASSPORT: "8 characters, e.g. K1234567",
  TAN: "10 characters, e.g. HYDA12345B",
  VAT: "5 to 20 letters and digits",
  VOTER_ID: "10 characters, e.g. ABC1234567",
};

/** The number as stored: upper case, spaces and dashes removed ("1234 5678 9012" -> "123456789012"). */
export function normalizeKycNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Null when the number fits the document type; otherwise what it should look like. */
export function kycNumberProblem(type: KycDocumentType, value: string): string | null {
  const number = normalizeKycNumber(value);
  if (!number) return "Enter the document number.";
  return KYC_NUMBER_PATTERNS[type].test(number)
    ? null
    : `A ${KYC_DOCUMENT_LABELS[type].replace(/ Number$/, "")} number is ${KYC_NUMBER_HINTS[type]}.`;
}

/** Body of PATCH .../:id/reschedule (partner before accepting, or admin before arrival). */
export interface ReschedulePickupDto {
  pickupDate: string; // YYYY-MM-DD
  pickupTimeSlot: string;
  reason: string;
}

/** Body of PATCH /admin/pickup-requests/:id/cancel. */
export interface CancelPickupDto {
  reason: string;
}
