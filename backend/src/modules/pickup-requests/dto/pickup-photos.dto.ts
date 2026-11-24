import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  KYC_DOCUMENT_TYPES,
  MAX_PHOTOS_PER_UPLOAD,
  PICKUP_PHOTO_KINDS,
  type KycDocumentType,
  type PickupPhotoKind,
} from '@nationwide/shared-types';

/**
 * The text fields sent alongside the photos in a multipart upload. `labels` pairs with `files`
 * by position; one label for several photos numbers them ("Box", "Box 2", ...).
 */
export class UploadPickupPhotosDto {
  @IsIn(PICKUP_PHOTO_KINDS)
  kind!: PickupPhotoKind;

  // Multipart sends one repeated field as an array but a single one as a plain string.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value : value === undefined ? undefined : [value],
  )
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS_PER_UPLOAD)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  labels?: string[];
}

/** The shipper's identity document. The number is checked against the type in the service. */
export class KycDocumentDto {
  @IsIn(KYC_DOCUMENT_TYPES)
  type!: KycDocumentType;

  @IsString()
  @MaxLength(40)
  number!: string;
}
