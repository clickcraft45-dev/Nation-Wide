import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryInvoicesDto {
  // Repeated query params arrive as a string when there is exactly one — normalised here so the
  // service always receives an array.
  @IsOptional()
  @Transform(({ value }): string[] =>
    Array.isArray(value) ? (value as string[]) : [String(value)],
  )
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
