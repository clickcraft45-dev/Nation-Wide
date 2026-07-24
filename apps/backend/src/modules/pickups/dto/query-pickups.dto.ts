import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { PICKUP_STATUSES, type PickupStatusCode } from '@nationwide/shared-types';

const PICKUP_RANGES = ['today', 'tomorrow', 'next7'] as const;
export type PickupRange = (typeof PICKUP_RANGES)[number];

export class QueryPickupsDto {
  @IsOptional()
  @IsIn(PICKUP_STATUSES)
  status?: PickupStatusCode;

  @IsOptional()
  @IsIn(PICKUP_RANGES)
  range?: PickupRange;

  @IsOptional()
  @IsISO8601()
  date?: string;
}
