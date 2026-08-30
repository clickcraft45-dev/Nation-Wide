import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsString,
} from 'class-validator';

export class GenerateInvoicesDto {
  /**
   * Capped rather than unbounded: each invoice consumes a number in a statutory series and
   * renders a PDF, so an accidental "select all" against every customer is expensive AND
   * irreversible (invoices are cancelled, never deleted). 200 is a comfortable month for this
   * business and a deliberate speed bump beyond it.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  customerIds!: string[];

  @Type(() => Date)
  @IsDate()
  from!: Date;

  @Type(() => Date)
  @IsDate()
  to!: Date;
}
