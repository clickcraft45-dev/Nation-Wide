import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryCustomersDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // matches customer name/email/phone
}
