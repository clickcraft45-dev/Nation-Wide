import {
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type PaymentMethodCode,
  type PaymentStatusCode,
} from '@nationwide/shared-types';

export class UpdateOrderPaymentDto {
  @IsIn(PAYMENT_STATUSES)
  paymentStatus!: PaymentStatusCode;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethodCode;

  @IsOptional()
  @IsPositive()
  @Max(1_000_000)
  paidAmount?: number;

  // A discount code to apply to this payment. Validated and redeemed server-side — what the
  // admin screen showed as the discount is a preview, not an instruction.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  couponCode?: string;

  // Who handed the money over — a consignee's relative, an office manager, the customer
  // themselves. Free text because that is what it is at the counter.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentPayerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentNote?: string;

  @IsOptional()
  @IsPositive()
  @Max(1_000_000)
  refundedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  refundNote?: string;
}
