import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Mirrors CustomsInvoiceDto in shared-types. */
class CustomsInvoiceItemInput {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;

  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  rate!: number;
}

class CustomsInvoiceBoxInput {
  @IsNumber()
  @Min(0)
  @Max(10_000)
  weightKg!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dimensions?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'Every box needs at least one item.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CustomsInvoiceItemInput)
  items!: CustomsInvoiceItemInput[];
}

export class CustomsInvoiceInput {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceNumber?: string | null;

  @IsDateString()
  invoiceDate!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  consignorName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  consignorAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  consignorPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  consignorIdLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  consignorIdNumber?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  consigneeName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  consigneeAddress!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  consigneeCountry!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  consigneePhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  buyer?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  countryOfOrigin!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  countryOfDestination!: string;

  @IsOptional() @IsString() @MaxLength(120) terms?: string | null;
  @IsOptional() @IsString() @MaxLength(80) preCarriageBy?: string | null;
  @IsOptional() @IsString() @MaxLength(80) placeOfReceipt?: string | null;
  @IsOptional() @IsString() @MaxLength(80) vesselFlightNo?: string | null;
  @IsOptional() @IsString() @MaxLength(80) portOfLoading?: string | null;
  @IsOptional() @IsString() @MaxLength(80) portOfDischarge?: string | null;
  @IsOptional() @IsString() @MaxLength(80) finalDestination?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  totalWeightKg?: number | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one box.' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CustomsInvoiceBoxInput)
  boxes!: CustomsInvoiceBoxInput[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  declaration?: string | null;
}
