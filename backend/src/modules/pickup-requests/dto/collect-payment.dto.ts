import { IsIn, IsOptional, IsPositive, IsString, Max } from 'class-validator';
import {
  PAYMENT_METHODS,
  type PaymentMethodCode,
} from '@nationwide/shared-types';

export class CollectPaymentDto {
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethodCode;

  @IsPositive()
  @Max(1_000_000)
  collectedAmount!: number;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  paymentNotes?: string;
}
