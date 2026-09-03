import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

// E.164: '+' followed by 8-15 digits, first digit non-zero.
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(E164_REGEX, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @MinLength(1)
  consentSource!: string;
}
