import { IsOptional, Matches } from 'class-validator';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An inclusive IST day range, YYYY-MM-DD. Either end may be left out; see analyticsWindow. */
export class QueryAnalyticsDto {
  @IsOptional()
  @Matches(ISO_DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
