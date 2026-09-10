import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  PICKUP_TIME_SLOTS,
  type PickupTimeSlot,
} from '@nationwide/shared-types';
import { RecipientAddressDto } from './recipient-address.dto';

const needsPickupAddress = (o: CreatePickupRequestDto) => !o.dropAtWarehouse;

// The "Pickup Request page" fields.
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

  // The pickup address is only collected when a partner is coming to fetch the parcel — a
  // warehouse drop-off has none, and must not be rejected for leaving it blank.
  @ValidateIf(needsPickupAddress)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  pickupAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupAddressLine2?: string;

  @ValidateIf(needsPickupAddress)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupCity?: string;

  @ValidateIf(needsPickupAddress)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupState?: string;

  @ValidateIf(needsPickupAddress)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  pickupPostalCode?: string;

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

  // Optional — the customer may add the recipient here, or leave it for the partner at pickup.
  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientAddressDto)
  recipient?: RecipientAddressDto;
}
