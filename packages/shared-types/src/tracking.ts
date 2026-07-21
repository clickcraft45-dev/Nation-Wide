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
  currentStatus: TrackingStatusCode;
  currentStatusLabel: string;
  lastUpdated: string; // ISO 8601 — always present, even when served from cache
  events: TrackingEventDto[];
}
