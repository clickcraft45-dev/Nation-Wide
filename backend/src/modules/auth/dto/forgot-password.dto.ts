import { IsEmail, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  // Same 10-character minimum as RegisterDto — a reset must not be a way to set a weaker
  // password than sign-up would have allowed.
  @IsString()
  @MinLength(10)
  password!: string;
}
