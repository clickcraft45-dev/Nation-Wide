import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Corrections staff make while reviewing an order's invoice, before it is sent. Every field is
 * optional: what is left out keeps its value. Tax is never typed in; it is recalculated from the
 * taxable value and the place of supply.
 */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  recipientPhone?: string;

  /** Empty string clears it: the customer is unregistered (B2C). */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Matches(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, {
    message: 'GSTIN must be 15 characters, e.g. 36ABCDE1234F1Z5',
  })
  recipientGstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recipientAddress?: string;

  /** An Indian state or union territory name; the GST code and CGST/SGST vs IGST follow. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  placeOfSupplyState?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  taxableValue?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  nonTaxableCharges?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  discountAmount?: number;
}
