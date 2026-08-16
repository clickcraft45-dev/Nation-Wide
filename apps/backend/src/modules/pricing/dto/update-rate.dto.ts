import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

// Ceilings are deliberately generous business-sanity bounds, not tight product limits — they
// exist to reject fat-finger/malicious input (e.g. gstPercent: 999999999) rather than to
// constrain legitimate pricing decisions.
const MAX_CURRENCY_AMOUNT = 1_000_000;
const MAX_PERCENT = 100;

// The 3 pricing fields only (Fuel Charge and PSS moved to provider-level config — see
// RateProvider) — Provider/Zone/Type/Weight identify which rate is being changed but aren't
// themselves editable (changing any of them is really a different rate; create a new one
// instead). Weight IS still editable here deliberately, since the "Update Existing Rate" path
// from the duplicate-detection prompt reuses this DTO against an exact-match weight it already
// knows — but a plain edit from the rates list also uses this to fix a mis-entered range.
export class UpdateRateDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightFromKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightToKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CURRENCY_AMOUNT)
  baseRate?: number;

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
