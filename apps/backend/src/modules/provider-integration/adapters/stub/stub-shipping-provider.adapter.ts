import { Injectable } from '@nestjs/common';
import type { TrackingStatusCode } from '@nationwide/shared-types';
import type {
  NormalizedTrackingEvent,
  NormalizedTrackingResult,
  ShippingProvider,
} from '../../interfaces/shipping-provider.interface';
import { hashString } from '../day-anchored-timestamp.util';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const PROGRESSION: Array<{
  status: TrackingStatusCode;
  rawStatus: string;
  location: string;
}> = [
  {
    status: 'PICKED_UP',
    rawStatus: 'PICKED_UP',
    location: 'Origin Facility, Mumbai',
  },
  {
    status: 'IN_TRANSIT',
    rawStatus: 'IN_TRANSIT',
    location: 'Transit Hub, Nagpur',
  },
  {
    status: 'OUT_FOR_DELIVERY',
    rawStatus: 'OUT_FOR_DELIVERY',
    location: 'Local Facility, Pune',
  },
  { status: 'DELIVERED', rawStatus: 'DELIVERED', location: 'Pune' },
];

/**
 * Deterministic mock so the tracking pipeline (cache, normalization, event history) can be
 * built and demoed end-to-end before real ICL API access exists (Section 12/31). Wraps a
 * plain in-memory computation today; a real adapter might wrap REST, SOAP, or an SFTP poller
 * behind this same interface without the Tracking module changing at all.
 */
@Injectable()
export class StubShippingProviderAdapter implements ShippingProvider {
  trackShipment(
    externalTrackingNumber: string,
  ): Promise<NormalizedTrackingResult> {
    const stageCount =
      (hashString(externalTrackingNumber) % PROGRESSION.length) + 1;
    // Anchor to the start of the current UTC day rather than the exact call time, so repeated
    // calls for the same tracking number (e.g. on every cache-expiry refetch) return identical
    // timestamps. Anchoring to Date.now() directly would make each poll look like a brand-new
    // event, defeating the Tracking service's dedupe-by-eventTime logic and endlessly
    // re-appending "new" events for a status that hasn't actually changed.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const anchor = dayStart.getTime();

    const events: NormalizedTrackingEvent[] = PROGRESSION.slice(
      0,
      stageCount,
    ).map((stage, index) => ({
      status: stage.status,
      rawStatus: stage.rawStatus,
      location: stage.location,
      eventTime: new Date(anchor - (stageCount - 1 - index) * ONE_DAY_MS),
    }));

    return Promise.resolve({ events });
  }
}
