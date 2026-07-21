import { Controller, Get, Param } from '@nestjs/common';
import type { TrackingResultDto } from '@nationwide/shared-types';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get(':internalTrackingNumber')
  getStatus(
    @Param('internalTrackingNumber') internalTrackingNumber: string,
  ): Promise<TrackingResultDto> {
    return this.trackingService.getStatus(internalTrackingNumber);
  }
}
