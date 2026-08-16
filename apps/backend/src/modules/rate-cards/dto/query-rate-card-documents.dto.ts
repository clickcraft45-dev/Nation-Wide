import { IsOptional, IsUUID } from 'class-validator';

export class QueryRateCardDocumentsDto {
  @IsOptional()
  @IsUUID()
  rateProviderId?: string;
}
