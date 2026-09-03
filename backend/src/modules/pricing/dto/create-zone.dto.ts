import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateZoneDto {
  @IsUUID()
  rateProviderId!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
