import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_CURRENCY_AMOUNT = 1_000_000;
const MAX_PERCENT = 100;

// Values-only — weight ranges are fixed in Bulk Edit (see RatesService.bulkUpdate for why the
// overlap check is skipped here).
export class BulkUpdateRateRowDto {
  @IsUUID()
  id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CURRENCY_AMOUNT)
  baseRate!: number;

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
}

export class BulkUpdateRatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateRateRowDto)
  updates!: BulkUpdateRateRowDto[];

  @IsOptional()
  @IsString()
  reason?: string;
}
