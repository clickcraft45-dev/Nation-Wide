import { IsString, MinLength } from 'class-validator';

export class RejectParcelDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
