import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  TrackingBatchItemDto,
  TrackingResultDto,
} from '@nationwide/shared-types';
import { TrackBatchDto } from './dto/track-batch.dto';
import { TrackingService } from './tracking.service';
import { publicTracking } from './public-view';

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

// A batch is up to 30 lookups in one request, so far fewer requests a minute: 6 batches is 180
// numbers, enough for a business re-checking its whole despatch list, while walking the
// sequential range stays a slow crawl.
const BATCH_THROTTLE = { default: { limit: 6, ttl: 60_000 } };
/** Lookups run this many at a time: each may call a carrier's API, which must not see a burst. */
const BATCH_CONCURRENCY = 5;

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Throttle(TRACKING_THROTTLE)
  // Inside the server-side cache window (TRACKING_CACHE_TTL_ACTIVE_SECONDS), so no fresher data
  // is missed; it only stops repeat clicks re-hitting the API.
  @Header('Cache-Control', 'private, max-age=60')
  @Get(':internalTrackingNumber')
  async getStatus(
    @Param('internalTrackingNumber') internalTrackingNumber: string,
  ): Promise<TrackingResultDto> {
    // Walking the sequential range is slow (the throttle above) and, with this, pointless: no
    // full names, phone numbers or declared values come back.
    return publicTracking(
      await this.trackingService.getStatus(internalTrackingNumber),
    );
  }

  /**
   * Several shipments in one go, one answer per number in the order asked. A number that is
   * not found, or whose carrier is down, gets its own error and never fails the others.
   */
  @Throttle(BATCH_THROTTLE)
  @Post('batch')
  @HttpCode(200)
  async getMany(@Body() body: TrackBatchDto): Promise<TrackingBatchItemDto[]> {
    const references = [
      ...new Set(body.numbers.map((n) => n.trim()).filter(Boolean)),
    ];
    const answers = new Array<TrackingBatchItemDto>(references.length);
    let next = 0;
    const worker = async () => {
      while (next < references.length) {
        const i = next++;
        const reference = references[i];
        try {
          const result = publicTracking(
            await this.trackingService.getStatus(reference),
          );
          answers[i] = { reference, result, error: null };
        } catch (error) {
          answers[i] = {
            reference,
            result: null,
            error:
              error instanceof NotFoundException ? 'NOT_FOUND' : 'UNAVAILABLE',
          };
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(BATCH_CONCURRENCY, references.length) },
        worker,
      ),
    );
    return answers;
  }
}
