import {
  IsIn,
  IsISO8601,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PICKUP_TIME_SLOTS,
  type PickupTimeSlot,
} from '@nationwide/shared-types';

/** A new day and slot for a pickup, with why: the customer is told both. */
export class ReschedulePickupDto {
  @IsISO8601()
  pickupDate!: string;

  @IsIn(PICKUP_TIME_SLOTS)
  pickupTimeSlot!: PickupTimeSlot;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class CancelPickupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
