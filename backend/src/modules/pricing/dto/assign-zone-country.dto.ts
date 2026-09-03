import { IsUUID } from 'class-validator';

export class AssignZoneCountryDto {
  @IsUUID()
  countryId!: string;
}
