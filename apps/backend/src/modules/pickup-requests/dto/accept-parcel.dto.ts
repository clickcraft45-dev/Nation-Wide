import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AcceptParcelDto {
  @IsBoolean()
  parcelPackedProperly!: boolean;

  @IsBoolean()
  weightVerifiedFlag!: boolean;

  @IsBoolean()
  restrictedItemsChecked!: boolean;

  @IsBoolean()
  documentsVerified!: boolean;

  @IsBoolean()
  isFragile!: boolean;

  @IsBoolean()
  insuranceRequired!: boolean;

  @IsOptional()
  @IsString()
  acceptanceRemarks?: string;
}
