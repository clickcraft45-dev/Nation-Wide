import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SaveItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  unitValue!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string;
}
