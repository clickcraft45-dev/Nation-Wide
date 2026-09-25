import type { ShipmentItemDto } from "./parcel";

export const TRACKING_STATUS_CODES = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION",
] as const;

export type TrackingStatusCode = (typeof TRACKING_STATUS_CODES)[number];

export interface TrackingEventDto {
  status: TrackingStatusCode;
  displayLabel: string;
  eventTime: string; // ISO 8601
  location: string | null;
}

/** The carrier actually moving the parcel, once an AWB has been mapped to the shipment. */
export interface TrackingCarrierDto {
  code: string;
  name: string;
  /** The carrier's own AWB / tracking number. */
  trackingNumber: string;
  // null for carriers with no public tracking page (a reseller, say) — render the name as plain
  // text rather than a dead link when this is null.
  trackingUrl: string | null;
}

export interface TrackingResultDto {
  internalTrackingNumber: string;
  /** Who booked the shipment, as it is on the order. */
  customerName: string;
  /**
   * The receiving party — name and phone as entered on the booking, whoever entered it (the
   * customer, staff, or the pickup partner at the door). Null only for a booking made before a
   * destination was recorded at all.
   */
  consigneeName: string | null;
  consigneePhone: string | null;
  /** What is inside, when the order recorded it. Empty when the contents were never captured. */
  items: ShipmentItemDto[];
  carrier: TrackingCarrierDto | null;
  // null when the shipment exists but no carrier tracking number has been mapped yet
  currentStatus: TrackingStatusCode | null;
  currentStatusLabel: string;
  // null when the shipment has never successfully synced; otherwise the last successful sync,
  // even if this particular response came from a fallback after a failed live call
  lastUpdated: string | null; // ISO 8601
  events: TrackingEventDto[];
}
