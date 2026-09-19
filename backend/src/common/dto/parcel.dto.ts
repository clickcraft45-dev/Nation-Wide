import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const anyDimension = (o: ParcelPackageDto) =>
  o.lengthCm != null || o.widthCm != null || o.heightCm != null;

/** One box. Dimensions are all-or-nothing: give one and the other two are required. */
export class ParcelPackageDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1000)
  weightKg!: number;

  @ValidateIf(anyDimension)
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  @Max(500)
  lengthCm?: number | null;

  @ValidateIf(anyDimension)
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  @Max(500)
  widthCm?: number | null;

  @ValidateIf(anyDimension)
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  @Max(500)
  heightCm?: number | null;
}

export class ShipmentItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsInt()
  @IsPositive()
  @Max(100_000)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  unitValue!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string | null;
}

/** A required, bounded list of boxes. */
export const PackagesList = () =>
  applyDecorators(
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(50),
    ValidateNested({ each: true }),
    Type(() => ParcelPackageDto),
  );

/** A required, bounded list of contents. */
export const ItemsList = () =>
  applyDecorators(
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(100),
    ValidateNested({ each: true }),
    Type(() => ShipmentItemDto),
  );

/** Keeps only the known keys, so a JSON column never stores whatever else the client sent. */
export function cleanPackages(packages: ParcelPackageDto[]) {
  return packages.map((p) => ({
    weightKg: p.weightKg,
    lengthCm: p.lengthCm ?? null,
    widthCm: p.widthCm ?? null,
    heightCm: p.heightCm ?? null,
  }));
}

export function cleanItems(items: ShipmentItemDto[]) {
  return items.map((i) => ({
    description: i.description.trim(),
    quantity: i.quantity,
    unitValue: i.unitValue,
    hsCode: i.hsCode?.trim() || null,
  }));
}
