import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PICKUP_TIME_SLOTS,
  type PickupTimeSlot,
} from '@nationwide/shared-types';

// The "Pickup Request page" fields — deliberately no destination address, that's already known
// from the quote (Section: Updated customer flow).
export class CreatePickupRequestDto {
  @IsUUID()
  quoteId!: string;

  @IsBoolean()
  dropAtWarehouse!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  pickupContactName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  pickupContactPhone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  pickupAddressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupAddressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupCity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupState!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  pickupPostalCode!: string;

  // Required unless dropAtWarehouse is true — enforced at the service layer since it's
  // conditional on another field, matching how CreateQuoteDto's own pickupDate/Slot are handled.
  @IsOptional()
  @IsISO8601()
  pickupDate?: string;

  @IsOptional()
  @IsIn(PICKUP_TIME_SLOTS)
  pickupTimeSlot?: PickupTimeSlot;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupInstructions?: string;
}
