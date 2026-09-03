import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { TrackingResultDto } from '@nationwide/shared-types';
import { TrackingService } from './tracking.service';

// internalTrackingNumber is a sequential, enumerable identifier (NW-{YY}-{sequence}) and this
// endpoint is intentionally public/unauthenticated (parcel tracking is public-by-design) — a
// tighter-than-global throttle keeps sequential enumeration from being scriptable at the lenient
// 300/min global default.
const TRACKING_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

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
