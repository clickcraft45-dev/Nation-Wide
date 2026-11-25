import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A corrected pickup address, from the partner (at or on the way to the door) or from staff.
 * Same limits as booking. The pin is sent every time: left out, it is cleared, because a pin
 * from the old address would send the partner to the wrong door.
 */
export class UpdatePickupAddressDto {
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

  @IsOptional()
  @IsLatitude()
  pickupLatitude?: number;

  @IsOptional()
  @IsLongitude()
  pickupLongitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupInstructions?: string;
}
