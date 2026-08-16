import { IsIn, IsNumber, IsPositive } from 'class-validator';
import {
  SHIPMENT_TYPES,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';

export class RecalculateWeightDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  weightKg!: number;

  @IsIn(SHIPMENT_TYPES)
  shipmentType!: ShipmentTypeCode;
}
