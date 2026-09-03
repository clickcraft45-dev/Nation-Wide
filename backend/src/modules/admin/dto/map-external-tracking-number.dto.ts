import { IsString, IsUUID, MinLength } from 'class-validator';

export class MapExternalTrackingNumberDto {
  @IsUUID()
  providerId!: string;

  @IsString()
  @MinLength(1)
  externalTrackingNumber!: string;
}
