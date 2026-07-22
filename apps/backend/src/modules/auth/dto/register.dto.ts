import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export class RegisterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(E164_REGEX, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
