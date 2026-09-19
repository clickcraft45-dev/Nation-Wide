import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewB2bRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
