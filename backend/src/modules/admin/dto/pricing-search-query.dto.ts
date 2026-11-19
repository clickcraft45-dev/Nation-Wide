import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `?q=` for the pricing search. A string (a repeated `q` arrives as an array and used to crash
 * the handler with a 500) and short: nobody's search for a country or carrier runs past 64.
 */
export class PricingSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;
}
