import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
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

/** Where and when the whole batch is collected — one address, however many shipments. */
export class B2bPickupDto {
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
}

/** One shipment in the batch: its own recipient, boxes and contents. */
export class B2bOrderDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => RecipientAddressDto)
  recipient!: RecipientAddressDto;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  destinationCountry!: string;

  @IsIn(SHIPMENT_TYPES)
  shipmentType!: ShipmentTypeCode;

  @PackagesList()
  packages!: ParcelPackageDto[];

  @ItemsList()
  items!: ShipmentItemDto[];

  /** The carrier they picked. Omitted: the cheapest that quotes this shipment. */
  @IsOptional()
  @IsUUID()
  rateProviderId?: string;
}

// Capped so one submission cannot price and write an unbounded number of rows; a business with
// more than this books a second batch.
const MAX_ORDERS_PER_BATCH = 25;

export class B2bCreateOrdersDto {
  @IsString()
  @MinLength(1)
  submissionKey!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => B2bPickupDto)
  pickup!: B2bPickupDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDERS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => B2bOrderDto)
  orders!: B2bOrderDto[];
}
