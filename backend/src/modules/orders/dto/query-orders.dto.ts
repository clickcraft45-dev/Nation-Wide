import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
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

  // Lets a caller that only wants one customer's orders (the admin customer-profile page) ask
  // the database for exactly those rows instead of fetching every order and filtering in JS.
  @IsOptional()
  @IsString()
  customerId?: string;

  // Mirrors the dashboard KPI links' ?status=in-transit|delivered, which group by the
  // shipment's live tracking status rather than the order's own lifecycle status.
  @IsOptional()
  @IsIn(['in-transit', 'delivered'])
  trackingGroup?: 'in-transit' | 'delivered';

  // Splits the Orders list by whether a carrier AWB has been mapped yet — the working queue for
  // an admin whose job is to assign the number customers then track with.
  @IsOptional()
  @IsIn(['mapped', 'unmapped'])
  awb?: 'mapped' | 'unmapped';

  // The two questions asked about a cancelled order, and the only two that decide whether it is
  // finished with: has the money gone back, and has the parcel. They are independent — a refund
  // does not imply the goods were returned, or the reverse.
  @IsOptional()
  @IsIn(['refunded', 'not-refunded'])
  refund?: 'refunded' | 'not-refunded';

  @IsOptional()
  @IsIn(['returned', 'not-returned'])
  returned?: 'returned' | 'not-returned';

  // Inclusive UTC day bounds on createdAt, as YYYY-MM-DD. The admin dashboard reports on a
  // window (default 90 days) and previously pulled EVERY order to filter in the browser — which
  // was both slow and quietly wrong, because the unpaginated response is capped at
  // MAX_UNBOUNDED_ORDERS rows, so a busy account simply lost the older half of its own window.
  // Bounding by date instead of by row count makes the window the thing that limits the query.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'createdFrom must be YYYY-MM-DD' })
  createdFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'createdTo must be YYYY-MM-DD' })
  createdTo?: string;

  @IsOptional()
  @IsIn(SORT_KEYS)
  sortKey?: OrderSortKey;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
