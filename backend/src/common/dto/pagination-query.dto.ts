import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Deliberately optional with no default applied here — callers that omit page/pageSize
// (dashboard aggregates, reports, the customer-search-as-you-type in the admin quote wizard)
// keep getting the full unfiltered array exactly as before, so adding pagination to a list
// endpoint never breaks an existing consumer that genuinely needs every row. Only callers that
// explicitly opt in (the real list-viewing admin pages) get skip/take applied — see
// resolvePagination() in pagination.util.ts.
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
