import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * One shipment on the invoice's freight schedule. Mirrors CustomInvoiceLineDto in shared-types.
 *
 * Only `amount` is required. A row for a re-delivery fee or a correction has no AWB and no
 * weight, and a required placeholder would put invented figures on a tax document.
 */
export class CustomInvoiceLineInput {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  awbNumber?: string;

  @IsOptional()
  @IsDateString()
  supplyDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  network?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  service?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weightKg?: number;

  /** Base freight. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  /** GMR / commercial charge. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherCharges?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pss?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fsc?: number;
}

/**
 * A one-off invoice with no order behind it.
 *
 * Two shapes, one endpoint. Either a single `grossAmount` — a re-delivery fee, packaging, a
 * correction — or `lines`, the shipment schedule the office bills from, in which case the total
 * is the sum of the rows and is NOT taken from the request: a client-supplied total that
 * disagreed with its own rows would put a figure on a tax document that nothing adds up to.
 *
 * Either way the amount is TAX-INCLUSIVE — the number the customer actually pays. It matches the
 * manual-quote path and is the figure staff have in their head; entering a pre-tax value and
 * watching the total come out higher than the amount quoted is the mistake this avoids.
 */
export class CreateCustomInvoiceDto {
  @IsString()
  customerId!: string;

  /** Required only when no `lines` are given; ignored when they are. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  grossAmount?: number;

  /**
   * Printed as the invoice's line item, so it has to actually describe the supply. Optional when
   * `lines` are given, because there the schedule itself is the description.
   */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomInvoiceLineInput)
  lines?: CustomInvoiceLineInput[];

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
