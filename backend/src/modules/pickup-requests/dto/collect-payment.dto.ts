import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DOOR_PAYMENT_METHODS,
  PAYMENT_METHODS,
  type PaymentMethodCode,
} from '@nationwide/shared-types';

/** One way the customer paid at the door: cash or UPI, and how much. */
export class PaymentSplitDto {
  @IsIn(DOOR_PAYMENT_METHODS)
  method!: PaymentMethodCode;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class CollectPaymentDto {
  /**
   * "Take the payment later" — the parcel is accepted with no money at the door and the amount
   * becomes a due on the order. An admin has to be named against it, because letting a parcel go
   * unpaid is their call, not the partner's.
   */
  @IsOptional()
  @IsBoolean()
  deferred?: boolean;

  /**
   * "Part now, the rest later" — collect what the customer has on them and carry the remainder
   * as a due. Deliberately an explicit flag rather than inferred from a small collectedAmount:
   * a mistyped figure must fail the tolerance check, not quietly become money owed.
   */
  @IsOptional()
  @IsBoolean()
  deferRemainder?: boolean;

  @ValidateIf(
    (dto: CollectPaymentDto) =>
      dto.deferred === true || dto.deferRemainder === true,
  )
  @IsUUID()
  dueApprovedByAdminId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  dueNote?: string;

  /**
   * How the money was taken: one entry, or one per method when it was split (Rs 2,000 cash and
   * Rs 400 UPI). Each method at most once. Their sum is what was collected.
   */
  @ValidateIf(
    (dto: CollectPaymentDto) =>
      dto.deferred !== true && dto.paymentMethod === undefined,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DOOR_PAYMENT_METHODS.length)
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments?: PaymentSplitDto[];

  // The single-method form, from app builds older than split payments. Read as one entry of
  // `payments`; ignored when `payments` is sent.
  @ValidateIf(
    (dto: CollectPaymentDto) =>
      dto.deferred !== true && dto.payments === undefined,
  )
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethodCode;

  @ValidateIf(
    (dto: CollectPaymentDto) =>
      dto.deferred !== true && dto.payments === undefined,
  )
  @IsPositive()
  @Max(1_000_000)
  collectedAmount?: number;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  paymentNotes?: string;
}
