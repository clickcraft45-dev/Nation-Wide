import { Type } from 'class-transformer';
import { IsDate, IsString, IsUUID } from 'class-validator';

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
}
