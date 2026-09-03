import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelInvoiceDto {
  // Required, and required to be substantive: cancelling a tax invoice leaves a permanent gap in
  // what the business can explain to an auditor, so "why" is not optional.
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
