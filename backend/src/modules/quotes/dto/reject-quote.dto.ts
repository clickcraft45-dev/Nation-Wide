import { IsString, MinLength } from 'class-validator';

export class RejectQuoteDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
