import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_TRACKING_BATCH } from '@nationwide/shared-types';

export class TrackBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TRACKING_BATCH, {
    message: `Track up to ${MAX_TRACKING_BATCH} shipments at a time.`,
  })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  numbers!: string[];
}
