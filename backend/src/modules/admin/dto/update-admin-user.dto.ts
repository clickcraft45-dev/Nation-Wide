import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // All three internal roles, so a person moving between the office and the field is one edit
  // rather than a delete-and-recreate that would orphan their history. CUSTOMER is excluded on
  // purpose: customers live in the customers table, so an AdminUser holding that role would be
  // an account that can authenticate but has no working surface anywhere in the app.
  @IsOptional()
  @IsIn(['STAFF', 'ADMIN', 'PICKUP_PARTNER'])
  role?: 'STAFF' | 'ADMIN' | 'PICKUP_PARTNER';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
