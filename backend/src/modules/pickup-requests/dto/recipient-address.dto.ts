import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The recipient's delivery address — added by the customer when booking the pickup, or taken down
 * and confirmed by the partner at the door. Written onto the quote's dest* fields.
 */
export class RecipientAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  state!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode!: string;
}
