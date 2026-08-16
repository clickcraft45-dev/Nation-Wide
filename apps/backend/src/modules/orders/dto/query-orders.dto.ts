import { IsIn, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const SORT_KEYS = ['id', 'customer', 'status', 'createdAt'] as const;
export type OrderSortKey = (typeof SORT_KEYS)[number];

export class QueryOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // matches order id, tracking number, customer name/phone

  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  providerId?: string;

  // Mirrors the dashboard KPI links' ?status=in-transit|delivered, which group by the
  // shipment's live tracking status rather than the order's own lifecycle status.
  @IsOptional()
  @IsIn(['in-transit', 'delivered'])
  trackingGroup?: 'in-transit' | 'delivered';

  @IsOptional()
  @IsIn(SORT_KEYS)
  sortKey?: OrderSortKey;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
