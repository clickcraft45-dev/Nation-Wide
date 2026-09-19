import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBrandTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** The template to start from. Omitted: a copy of the active one. */
  @IsOptional()
  @IsUUID()
  copyFromId?: string;
}
