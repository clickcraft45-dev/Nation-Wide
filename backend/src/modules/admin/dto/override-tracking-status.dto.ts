import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  TRACKING_STATUS_CODES,
  type TrackingStatusCode,
} from '@nationwide/shared-types';

export class OverrideTrackingStatusDto {
  @IsIn(TRACKING_STATUS_CODES)
  status!: TrackingStatusCode;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
