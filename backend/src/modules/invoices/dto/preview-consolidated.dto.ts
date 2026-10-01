import { Type } from 'class-transformer';
import { IsDate, IsString, IsUUID } from 'class-validator';

/**
 * The window to look at before anything is issued. Same three fields the issue itself takes,
 * minus the selection — there is nothing to select yet.
 */
export class PreviewConsolidatedDto {
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
