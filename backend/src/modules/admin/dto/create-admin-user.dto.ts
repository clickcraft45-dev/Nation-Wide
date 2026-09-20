import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  // See RegisterDto.password (AUTH-3) for why 10, not 8.
  @IsString()
  @MinLength(10)
  password!: string;

  // PICKUP_PARTNER is deliberately not accepted: those accounts carry different fields and are
  // created through /admin/pickup-partners. Allowing it here would let this endpoint mint
  // partners that bypass that flow's own rules.
  @IsIn(['ADMIN', 'SUPER_ADMIN'])
  role!: 'ADMIN' | 'SUPER_ADMIN';

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
