import { IsOptional, IsPositive, IsString } from 'class-validator';

export class ManualQuoteDto {
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}
