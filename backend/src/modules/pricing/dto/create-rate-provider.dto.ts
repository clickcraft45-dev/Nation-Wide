import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRateProviderDto {
  // The pricing engine and rate-sheet import key off this: FEDEX, UPS, DHL_EXPRESS.
  @IsString()
  @Matches(/^[A-Z0-9_]{2,32}$/, {
    message: 'code is 2 to 32 capital letters, digits or underscores',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  // Set at creation as well as on edit, so a new carrier is not quoted at 0% fuel until someone
  // remembers to come back. Same rules as UpdateRateProviderDto.
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
}
