import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PICKUP_TIME_SLOTS,
  SHIPMENT_TYPES,
  type PickupTimeSlot,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';
import {
  ItemsList,
  PackagesList,
  ParcelPackageDto,
  ShipmentItemDto,
} from '../../../common/dto/parcel.dto';
import { RecipientAddressDto } from './recipient-address.dto';

// Staff booking a pickup for a customer and assigning it to a partner in one step. Unlike the
// customer's own booking, everything is taken upfront: staff are on the phone with the customer.
export class AdminCreatePickupOrderDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  submissionKey!: string;

  @IsIn(SHIPMENT_TYPES)
  shipmentType!: ShipmentTypeCode;

  @PackagesList()
  packages!: ParcelPackageDto[];

  @ItemsList()
  items!: ShipmentItemDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  destinationCountry!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => RecipientAddressDto)
  recipient!: RecipientAddressDto;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  pickupContactName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  pickupContactPhone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  pickupAddressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupAddressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupCity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupState!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  pickupPostalCode!: string;

  @IsOptional()
  @IsLatitude()
  pickupLatitude?: number;

  @IsOptional()
  @IsLongitude()
  pickupLongitude?: number;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  pickupMapsUrl?: string;

  @IsISO8601()
  pickupDate!: string;

  @IsIn(PICKUP_TIME_SLOTS)
  pickupTimeSlot!: PickupTimeSlot;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupInstructions?: string;

  // Exactly one of these two — checked in the service, which can say which one is missing.
  @IsOptional()
  @IsUUID()
  rateProviderId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  manualPrice?: number;

  @IsUUID()
  partnerId!: string;
}
