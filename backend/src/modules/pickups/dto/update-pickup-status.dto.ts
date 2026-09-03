import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import {
  PICKUP_STATUSES,
  type PickupStatusCode,
} from '@nationwide/shared-types';

export class UpdatePickupStatusDto {
  @IsIn(PICKUP_STATUSES)
  status!: PickupStatusCode;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  weightVerifiedKg?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
