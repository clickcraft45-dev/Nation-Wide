import { IsString, MinLength } from 'class-validator';

export class MapExternalTrackingNumberDto {
  @IsString()
  @MinLength(1)
  externalTrackingNumber!: string;
}
