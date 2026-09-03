import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateRateProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Provider Configuration — constant across every country/weight/shipment-type this provider
  // quotes (see RateProvider's schema doc comment). Every future quote picks these up
  // automatically; already-generated quotes keep the values frozen onto their RateQuoteOption.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fuelChargePercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pssPerKg?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
