import { IsString, MinLength } from 'class-validator';

export class ResetAdminUserPasswordDto {
  // Same floor as registration (AUTH-3) — an admin-set password is not a weaker credential.
  @IsString()
  @MinLength(10)
  password!: string;
}
