import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCompanySettingsDto {
  // Validated in shape, not merely in length: a typo'd GSTIN is copied verbatim onto every
  // invoice issued thereafter, and those are immutable once issued. Two digits of state code,
  // ten-character PAN, entity number, 'Z', then a checksum character.
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, {
    message: 'gstin must be a valid 15-character GSTIN',
  })
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  stateName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{2}$/, { message: 'stateCode must be two digits' })
  stateCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'sacCode must be six digits' })
  sacCode?: string;

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
