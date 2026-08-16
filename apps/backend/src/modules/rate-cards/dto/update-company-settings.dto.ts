import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  supportPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  termsAndConditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  footerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  insuranceDisclaimer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  legalDisclaimer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  restrictedItemsNotice?: string;
}
