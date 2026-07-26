import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import {
  SHIPMENT_TYPES,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';

export class QuotePreviewQueryDto {
  @IsString()
  @MinLength(1)
  destinationCountry!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  weightKg!: number;

  @IsIn(SHIPMENT_TYPES)
  shipmentType!: ShipmentTypeCode;
}
