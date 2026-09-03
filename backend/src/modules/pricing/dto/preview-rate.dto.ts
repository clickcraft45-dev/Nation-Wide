import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const MAX_CURRENCY_AMOUNT = 1_000_000;
const MAX_PERCENT = 100;

// No-persistence preview of the 7-step price calculation for the Individual Rate Editor's
// "Final Calculated Price" — see PricingEngineService.calculateFinalPrice, the single
// authoritative implementation this reuses instead of duplicating.
export class PreviewRateDto {
  @IsUUID()
  rateProviderId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1000)
  weightKg!: number;

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
}
