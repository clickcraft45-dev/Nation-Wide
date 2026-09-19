import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Same E.164 rule as RegisterDto: approving this creates a Customer, whose phone must be dialable
// and is unique.
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * A public submission from the website's business section. Carries no password, no role and no
 * account: it creates a request row that a human reviews (see B2bRequestsService.approve).
 *
 * Every field is length-capped because this endpoint is unauthenticated — without caps a single
 * request can push megabytes into the table.
 */
export class CreateB2bRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  companyName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  contactName!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @Matches(E164_REGEX, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  monthlyVolume?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
