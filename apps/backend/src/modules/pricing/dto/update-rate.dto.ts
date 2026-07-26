import { IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

// The 5 pricing fields only — Provider/Country/Weight identify which rate is being changed but
// aren't themselves editable (changing any of them is really a different rate; create a new one
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
  baseRate?: number;

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
