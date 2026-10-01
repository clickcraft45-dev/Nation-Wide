import { Type } from 'class-transformer';
import { IsArray, IsDate, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * One consolidated invoice for one customer over one window.
 *
 * Single customer, not a list: the bulk "generate for these 200 customers" screen this replaced
 * fanned out into one document per order per customer, which is what auto-invoicing on payment
 * now does by itself. A consolidated bill is a deliberate act for a named account, so it takes
 * a named account.
 */
export class ConsolidateInvoiceDto {
  @IsString()
  @IsUUID()
  customerId!: string;

  @Type(() => Date)
  @IsDate()
  from!: Date;

  @Type(() => Date)
  @IsDate()
  to!: Date;

  // The rows ticked in the preview. Omitted bills the whole window, which is what this did
  // before the preview existed — so an older client keeps working.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  orderIds?: string[];
}
