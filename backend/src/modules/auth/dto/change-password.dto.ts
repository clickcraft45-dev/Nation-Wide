import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  // See RegisterDto.password for why this is 10, and why LoginDto.password's own MinLength is
  // deliberately left lower — the same reasoning applies to currentPassword implicitly not being
  // length-checked here at all (it's whatever the account's existing password already is).
  @IsString()
  @MinLength(10)
  newPassword!: string;
}
