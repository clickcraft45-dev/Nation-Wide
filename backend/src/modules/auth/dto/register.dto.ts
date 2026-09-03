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

  // 10, not the older 8 — length is what actually raises brute-force cost (current NIST 800-63B
  // guidance favors length over arbitrary complexity rules). Login's own MinLength deliberately
  // stays at 8 so this doesn't lock out any account created under the previous policy.
  @IsString()
  @MinLength(10)
  password!: string;
}
