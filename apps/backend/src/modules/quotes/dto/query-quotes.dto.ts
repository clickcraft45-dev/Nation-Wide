import { IsIn, IsOptional, IsString } from 'class-validator';
import { QUOTE_STATUSES, type QuoteStatusCode } from '@nationwide/shared-types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryQuotesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // matches customer name/email/phone

  @IsOptional()
  @IsIn(QUOTE_STATUSES)
  status?: QuoteStatusCode;
}
