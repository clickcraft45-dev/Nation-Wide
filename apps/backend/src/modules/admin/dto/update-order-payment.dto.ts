import { IsIn, IsOptional, IsPositive } from 'class-validator';
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
  paidAmount?: number;
}
