import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

const MAX_CURRENCY_AMOUNT = 1_000_000;
const MAX_PERCENT = 100;

export class UpsertWeightSlabDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightFromKg!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightToKg!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CURRENCY_AMOUNT)
  baseRate!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PERCENT)
  gstPercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_CURRENCY_AMOUNT)
  nationwideCut?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
