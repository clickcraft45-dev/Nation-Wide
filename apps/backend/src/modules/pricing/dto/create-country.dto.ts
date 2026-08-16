import { IsString, Length, Matches, MinLength } from 'class-validator';

export class CreateCountryDto {
  // ISO 3166-1 alpha-2 only (matches every real country code and how flag.service.ts's flag
  // SVGs are named) — also forecloses this ever being usable as a path-traversal vector into
  // that filesystem lookup, however unlikely that already was.
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
