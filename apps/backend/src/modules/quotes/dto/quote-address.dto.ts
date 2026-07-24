import { IsOptional, IsString, MinLength } from 'class-validator';

export class QuoteAddressDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  @MinLength(1)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsString()
  @MinLength(1)
  state!: string;

  @IsString()
  @MinLength(1)
  postalCode!: string;

  @IsString()
  @MinLength(1)
  country!: string;
}

export class QuoteOriginAddressDto extends QuoteAddressDto {
  @IsOptional()
  @IsString()
  instructions?: string;
}
