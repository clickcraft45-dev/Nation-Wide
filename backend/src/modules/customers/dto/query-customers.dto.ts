import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryCustomersDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // matches customer name/email/phone

  // Whole-UTC-day bounds, the same shape QueryOrdersDto uses. Reports need "customers who signed
  // up in this window" and were downloading every account ever created to count them in the
  // browser.
  @IsOptional()
  @IsString()
  createdFrom?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  createdTo?: string; // YYYY-MM-DD
}
