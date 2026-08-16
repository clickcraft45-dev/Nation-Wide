import { IsString, Matches, MinLength } from 'class-validator';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export class CompleteGoogleSignupDto {
  @IsString()
  @MinLength(10)
  pendingToken!: string;

  @Matches(E164_REGEX, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone!: string;
}
