import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePickupPartnerDto {
  @IsEmail()
  email!: string;

  /**
   * Optional. Left out, the service generates one and emails it to the partner, which is the
   * normal path — an admin typing a password and then relaying it over WhatsApp was both the
   * slowest step in onboarding and the one that leaked credentials into chat history.
   *
   * Still accepted so an admin can set a specific password when a partner cannot receive mail.
   */
  // See RegisterDto.password (AUTH-3) for why 10, not 8.
  @IsOptional()
  @IsString()
  @MinLength(10)
  password?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
