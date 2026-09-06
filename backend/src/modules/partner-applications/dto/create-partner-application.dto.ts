import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Same E.164 rule as RegisterDto — a partner's phone is how dispatch reaches them in the field,
// so it has to be dialable, not just present.
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * A public submission. Deliberately carries NO password and NO role: this creates an application
 * row, never an account. The password is chosen by the admin at approval time, when
 * PickupPartnersService.create() mints the real AdminUser.
 *
 * Every field is length-capped because this endpoint is unauthenticated — without caps a single
 * request can push megabytes into the table.
 */
export class CreatePartnerApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @Matches(E164_REGEX, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  serviceArea!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
