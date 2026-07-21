import type { TrackingStatusCode } from '@nationwide/shared-types';

export interface NormalizedTrackingEvent {
  status: TrackingStatusCode;
  eventTime: Date;
  location: string | null;
  rawStatus: string;
  rawPayload?: unknown;
}

export interface NormalizedTrackingResult {
  events: NormalizedTrackingEvent[]; // chronological order, oldest first
}

/**
 * Every concrete adapter (stub today; ICLAdapter, DHLAdapter, ... later) implements this and
 * is solely responsible for translating to/from that provider's own request/response format,
 * auth scheme, and status vocabulary. Nothing outside provider-integration/adapters/* should
 * ever see a provider-specific field name. See architecture doc Section 11.
 */
export interface ShippingProvider {
  trackShipment(
    externalTrackingNumber: string,
  ): Promise<NormalizedTrackingResult>;
}
