import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { B2bPickupDto, OrderShipmentDto } from './b2b-create-orders.dto';
import { RecipientAddressDto } from './recipient-address.dto';

/**
 * One shipment of a staff booking: the portal's shape plus a price staff may set by hand. The
 * recipient is optional: the partner takes it down at the door, where verify requires it.
 */
export class AdminOrderDto extends OrderShipmentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientAddressDto)
  recipient?: RecipientAddressDto;

  /**
   * What to charge when no rate card covers the route — the same escape hatch the single-shipment
   * screen had. Staff-only: the customer portal never names its own price.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  manualPrice?: number;
}

/**
 * Staff booking for a customer: one collection, as many delivery addresses as they have, each
 * with its own boxes and contents — the same shape the B2B portal posts, plus the partner who
 * collects them all.
 */
export class AdminCreatePickupOrderDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  submissionKey!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => B2bPickupDto)
  pickup!: B2bPickupDto;

  /**
   * Optional. Left out (the usual case), staff only dispatch: the partner takes the destination,
   * recipient, boxes, contents and price at the door.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => AdminOrderDto)
  orders?: AdminOrderDto[];

  @IsUUID()
  partnerId!: string;

  /**
   * Where it is going, when staff already know. Saves the partner asking at the door; left out,
   * they take it down there as before.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  destinationCountry?: string;

  /**
   * The carrier it goes by: one with a rate card for destinationCountry. The partner's price at
   * the door is then worked out from this carrier's rates for the weight they measure.
   */
  @IsOptional()
  @IsUUID()
  rateProviderId?: string;
}
