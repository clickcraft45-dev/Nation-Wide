import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePickupPartnerDto {
  @IsEmail()
  email!: string;

  // See RegisterDto.password (AUTH-3) for why 10, not 8.
  @IsString()
  @MinLength(10)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
