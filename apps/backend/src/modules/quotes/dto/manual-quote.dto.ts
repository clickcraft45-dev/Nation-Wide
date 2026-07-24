import { IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

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
