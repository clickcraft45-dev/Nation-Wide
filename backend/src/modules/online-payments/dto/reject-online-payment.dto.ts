import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectOnlinePaymentDto {
  // Required: turning away money a customer says they sent has to say why, for whoever takes
  // their call about it.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;
}
