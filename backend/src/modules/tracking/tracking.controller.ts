import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { TrackingResultDto } from '@nationwide/shared-types';
import { TrackingService } from './tracking.service';

// internalTrackingNumber is a sequential, enumerable identifier (NW-{YY}-{sequence}) and this
// endpoint is intentionally public/unauthenticated (parcel tracking is public-by-design) — a
// tighter-than-global throttle keeps sequential enumeration from being scriptable at the lenient
// 300/min global default.
//
// 60/min, not the 20 this started at. Twenty was written for a per-visitor bucket, but until
// main.ts trusted the reverse proxy every request carried the proxy's IP, so the whole internet
// shared those twenty: two customers refreshing a parcel locked the tracking page for everyone.
// With req.ip now resolving to the real client, this is a genuine per-visitor limit — one lookup
// a second, which no human reaches and which still leaves walking the NW-{YY}-{sequence} range
// a slow, obvious crawl rather than a scriptable dump.
const TRACKING_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Throttle(TRACKING_THROTTLE)
  @Get(':internalTrackingNumber')
  getStatus(
    @Param('internalTrackingNumber') internalTrackingNumber: string,
  ): Promise<TrackingResultDto> {
    return this.trackingService.getStatus(internalTrackingNumber);
  }
}
