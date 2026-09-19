import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  PICKUP_REQUEST_STATUSES,
  type PickupRequestStatusCode,
} from '@nationwide/shared-types';

export class QueryPickupRequestsDto {
  @IsOptional()
  @IsIn(PICKUP_REQUEST_STATUSES)
  status?: PickupRequestStatusCode;

  @IsOptional()
  @IsString()
  search?: string;

  // The pickup an order was created from (admin order detail).
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
