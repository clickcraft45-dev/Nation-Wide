import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import {
  QUOTE_REVIEW_REASONS,
  QUOTE_STATUSES,
  type QuoteReviewReasonCode,
  type QuoteStatusCode,
} from '@nationwide/shared-types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryQuotesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // matches customer name/email/phone

  @IsOptional()
  @IsIn(QUOTE_STATUSES)
  status?: QuoteStatusCode;

  // Several statuses at once, comma-separated (`?statuses=REJECTED,CANCELLED`) — one admin tab
  // groups more than one status. Ignored when `status` is set.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(QUOTE_STATUSES, { each: true })
  statuses?: QuoteStatusCode[];

  @IsOptional()
  @IsIn(QUOTE_REVIEW_REASONS)
  reviewReason?: QuoteReviewReasonCode;

  /** Only quotes priced before this instant — "quotation sent, still unanswered after N days". */
  @IsOptional()
  @IsDateString()
  quotedBefore?: string;

  /** Only quotes created on or after this instant. */
  @IsOptional()
  @IsDateString()
  createdAfter?: string;
}
