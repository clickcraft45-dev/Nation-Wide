import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  SHIPMENT_TYPES,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';

export class QueryRatesDto {
  @IsOptional()
  @IsUUID()
  rateProviderId?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsIn(SHIPMENT_TYPES)
  shipmentType?: ShipmentTypeCode;

  // Filters to rates whose [weightFromKg, weightToKg] range covers this weight — lets the admin
  // list "which rates apply to a 2kg shipment" rather than only exact-match the stored range.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  weightKg?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
