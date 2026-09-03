import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  RATE_CARD_TEMPLATE_KEYS,
  SHIPMENT_TYPES,
  type RateCardTemplateKey,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';

// OTHER is excluded — those shipments never have a rate card (they always short-circuit to
// manual review), matching the same exclusion CreateRateDto already uses.
const RATEABLE_SHIPMENT_TYPES = SHIPMENT_TYPES.filter((t) => t !== 'OTHER');

export class RateCardCountrySelectionDto {
  @IsUUID()
  countryId!: string;

  @IsOptional()
  @IsString()
  transitTime?: string;
}

export class GenerateRateCardDto {
  @IsUUID()
  rateProviderId!: string;

  @IsIn(RATEABLE_SHIPMENT_TYPES)
  shipmentType!: ShipmentTypeCode;

  @ValidateNested({ each: true })
  @Type(() => RateCardCountrySelectionDto)
  @ArrayMinSize(1)
  countries!: RateCardCountrySelectionDto[];

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsIn(RATE_CARD_TEMPLATE_KEYS)
  templateKey?: RateCardTemplateKey;
}
