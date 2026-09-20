import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { B2bOrderDto, B2bPickupDto } from './b2b-create-orders.dto';

/** One shipment of a staff booking: the portal's shape plus a price staff may set by hand. */
export class AdminOrderDto extends B2bOrderDto {
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => AdminOrderDto)
  orders!: AdminOrderDto[];

  @IsUUID()
  partnerId!: string;
}
