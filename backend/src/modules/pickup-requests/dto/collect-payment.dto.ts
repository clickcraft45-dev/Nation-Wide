import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  PAYMENT_METHODS,
  type PaymentMethodCode,
} from '@nationwide/shared-types';

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

  // Money actually collected — required unless the payment is being deferred.
  @ValidateIf((dto: CollectPaymentDto) => dto.deferred !== true)
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethodCode;

  @ValidateIf((dto: CollectPaymentDto) => dto.deferred !== true)
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
