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

export interface TrackingResultDto {
  internalTrackingNumber: string;
  // null when the shipment exists but no carrier tracking number has been mapped yet
  currentStatus: TrackingStatusCode | null;
  currentStatusLabel: string;
  // null when the shipment has never successfully synced; otherwise the last successful sync,
  // even if this particular response came from a fallback after a failed live call
  lastUpdated: string | null; // ISO 8601
  events: TrackingEventDto[];
}
