import { IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class UpsertWeightSlabDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightFromKg!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightToKg!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  baseRate!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pssAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fuelChargePercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  gstPercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  nationwideCut?: number;
}
