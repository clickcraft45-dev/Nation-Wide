import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class QuoteAddressDto {
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

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country!: string;
}

/**
 * The customer self-service quote's recipient. Only the country is required — it is picked first
 * and drives pricing. The rest may be left for the pickup partner to take down and confirm at the
 * door (PickupRequestsService.verify). CreateAdminQuoteDto re-requires the full QuoteAddressDto.
 */
export class QuoteDestinationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country!: string;
}

export class QuoteOriginAddressDto extends QuoteAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}
