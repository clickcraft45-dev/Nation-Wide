import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsUUID,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @Type(() => Date)
  @IsDate()
  expenseDate!: Date;

  @IsUUID()
  categoryId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  paidTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  referenceNo?: string;
}
