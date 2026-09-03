import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetRateActiveDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
