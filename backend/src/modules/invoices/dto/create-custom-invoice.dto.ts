import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A one-off invoice with no order behind it.
 *
 * `grossAmount` is TAX-INCLUSIVE — the number the customer actually pays. It matches the
 * manual-quote path and is the figure staff have in their head; entering a pre-tax value and
 * watching the total come out higher than the amount quoted is the mistake this avoids.
 */
export class CreateCustomInvoiceDto {
  @IsString()
  customerId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  grossAmount!: number;

  /** Printed as the invoice's line item, so it has to actually describe the supply. */
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  description!: string;

  /**
   * Omit for an intra-state supply. Naming a state here is what makes the invoice charge IGST
   * instead of CGST+SGST, so it is the admin's explicit call rather than an inference from a
   * free-text customer address.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  placeOfSupplyState?: string;
}
