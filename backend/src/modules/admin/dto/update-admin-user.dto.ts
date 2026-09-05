import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['STAFF', 'ADMIN'])
  role?: 'STAFF' | 'ADMIN';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
