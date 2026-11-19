import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateRateProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
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
  @Max(100)
  fuelChargePercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  pssPerKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultNationwideCut?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
