import type { AddressBookDto, ParcelPackageDto, ShipmentItemDto } from "./parcel";
import type { PickupRecipientDto } from "./pickup-request";
import type { PickupTimeSlot, ShipmentTypeCode } from "./quote";

/**
 * A standing order-request link for a business customer. The token is returned exactly once, when
 * the link is created — afterwards only its hash is stored, so a lost link is replaced, not
 * recovered.
 */
export interface B2bLinkDto {
  id: string;
  label: string;
  /** Who at the business was handed this link, when an admin recorded it. */
  contactName: string | null;
  customerId: string;
  lastUsedAt: string | null; // ISO 8601
  revokedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  /** Only on the create response. Show it once, then it is gone. */
  url?: string;
  /**
   * Only on the create response: the address the link was mailed to, or null when the business
   * has no email on file or the send failed. The dialog still shows the URL either way.
   */
  emailedTo?: string | null;
}

export interface CreateB2bLinkDto {
  label: string;
  contactName?: string;
}

/** A link listed on the cross-customer manager, where the customer is not implied by the page. */
export interface B2bLinkOverviewDto extends B2bLinkDto {
  customerName: string;
  customerEmail: string | null;
  /** Whether that customer also has a portal login, not just this link. */
  customerIsB2b: boolean;
  createdByEmail: string | null;
}

/** What an admin gets back after inviting a business onto the portal. */
export interface B2bInviteResultDto {
  email: string;
  expiresInMinutes: number;
}

/** What the portal needs on open: who it belongs to, and everything reusable. */
export interface B2bSessionDto {
  customerName: string;
  /** The link's label, or "Signed in" when reached with a business account. */
  linkLabel: string;
  addressBook: AddressBookDto;
}

export interface B2bOrderInputDto {
  recipient: Omit<PickupRecipientDto, "addressLine2"> & { addressLine2?: string };
  destinationCountry: string;
  shipmentType: ShipmentTypeCode;
  packages: ParcelPackageDto[];
  items: ShipmentItemDto[];
  /** Omitted: the cheapest carrier that quotes the shipment. */
  rateProviderId?: string;
}

export interface B2bCreateOrdersDto {
  submissionKey: string;
  pickup: {
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
    pickupDate: string; // ISO 8601 date-only
    pickupTimeSlot: PickupTimeSlot;
    pickupInstructions?: string;
  };
  orders: B2bOrderInputDto[];
}

/**
 * One shipment's outcome. NEEDS_PRICING means no rate card covers that route or weight: the
 * request is recorded and priced by staff rather than dispatched at a price nobody set.
 */
export interface B2bOrderResultDto {
  index: number;
  recipientName: string;
  destinationCountry: string;
  status: "BOOKED" | "NEEDS_PRICING";
  quoteId: string;
  pickupRequestId: string | null;
  carrier: string | null;
  price: number | null;
  currency: string | null;
}

/** A shipment already requested through the link, for the portal's own history list. */
export interface B2bRequestSummaryDto {
  id: string;
  status: string;
  recipientName: string | null;
  destinationCountry: string;
  pickupDate: string | null;
  price: number;
  currency: string;
  carrier: string | null;
  createdAt: string; // ISO 8601
}
