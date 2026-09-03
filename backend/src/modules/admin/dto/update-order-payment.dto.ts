import { IsIn, IsOptional, IsPositive, Max } from 'class-validator';
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
}
