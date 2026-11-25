import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

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

  // A UPI ID (VPA) is handle@bank. Checked in shape: a typo here sends every UPI payment taken
  // at a door to an address that does not exist, or worse, to one that does.
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/, {
    message: 'upiId must be a UPI ID such as name@bank',
  })
  upiId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  upiPayeeName?: string;

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

  // One term per line; the invoice prints them as a numbered list.
  @IsOptional()
  @IsString()
  @MaxLength(8000)
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

  // Cancellation charges, and the warehouse the per-km half is measured from. Read off the
  // active template when a customer cancels — see OrdersService.quoteCancellation.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cancellationBaseFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cancellationPerKmFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  warehouseLatitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  warehouseLongitude?: number;
}
