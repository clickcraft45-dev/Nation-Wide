import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class MarginBandDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  fromKg!: number;

  // Null (or omitted) is the open-ended top band — "everything above this weight".
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  toKg?: number | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  flatAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  perKgAmount!: number;
}

export class SetMarginBandsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarginBandDto)
  bands!: MarginBandDto[];

  @IsOptional()
  @IsString()
  reason?: string;
}
