import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FULFILLMENT_METHODS,
  PICKUP_TIME_SLOTS,
  SHIPMENT_TYPES,
  type FulfillmentMethodCode,
  type PickupTimeSlot,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';
import { QuoteAddressDto, QuoteOriginAddressDto } from './quote-address.dto';

export class CreateQuoteDto {
  @IsIn(SHIPMENT_TYPES)
  shipmentType!: ShipmentTypeCode;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  weightKg!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @ValidateNested()
  @Type(() => QuoteOriginAddressDto)
  origin!: QuoteOriginAddressDto;

  @ValidateNested()
  @Type(() => QuoteAddressDto)
  destination!: QuoteAddressDto;

  @IsIn(FULFILLMENT_METHODS)
  fulfillmentMethod!: FulfillmentMethodCode;

  // Required/validated against the [today, today+7] window and forbidden for
  // WAREHOUSE_DROP_OFF at the service layer (Section: Quote lifecycle) — presence here is
  // conditional on fulfillmentMethod, which class-validator can't express declaratively without
  // a custom validator, so QuotesService.create is the source of truth.
  @IsOptional()
  @IsISO8601()
  pickupDate?: string;

  @IsOptional()
  @IsIn(PICKUP_TIME_SLOTS)
  pickupTimeSlot?: PickupTimeSlot;

  @IsString()
  @MinLength(1)
  submissionKey!: string;
}
