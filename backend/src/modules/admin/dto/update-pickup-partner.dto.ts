import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePickupPartnerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
