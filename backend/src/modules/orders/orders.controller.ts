import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { OrderDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { toOrderDto } from './order.mapper';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

// Tighter than the lenient 300/min global default — a compromised/careless STAFF+ account
// scripting order creation would otherwise be able to spam real DB writes at the global rate.
const ORDER_CREATE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Registered ahead of :id so "me" is never swallowed as an :id param. Scoped to the
  // caller's own customerId from the verified JWT — never a client-supplied id.
  @Get('me')
  @Roles('CUSTOMER')
  async findMine(@CurrentUser() user: JwtPayload): Promise<OrderDto[]> {
    const orders = await this.ordersService.findAllForCustomer(user.sub);
    return orders.map(toOrderDto);
  }

  @Throttle(ORDER_CREATE_THROTTLE)
  @Post()
  @Roles('STAFF', 'ADMIN')
  async create(@Body() dto: CreateOrderDto): Promise<OrderDto> {
    const order = await this.ordersService.create(dto);
    return toOrderDto(order);
  }

  // Response body is always a plain array (dashboard/reports/payments aggregation all need
  // every row). Passing page/pageSize opts into skip/take and adds an X-Total-Count header the
  // admin orders list page reads to render pagination controls.
  @Get()
  @Roles('STAFF', 'ADMIN')
  async findAll(
    @Query() query: QueryOrdersDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderDto[]> {
    const { data, total } = await this.ordersService.findAll(query);
    if (total !== null) res.setHeader('X-Total-Count', String(total));
    return data.map(toOrderDto);
  }

  @Get(':id')
  @Roles('STAFF', 'ADMIN')
  async findOne(@Param('id') id: string): Promise<OrderDto> {
    const order = await this.ordersService.findOne(id);
    return toOrderDto(order);
  }

  @Patch(':id')
  @Roles('STAFF', 'ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderDto> {
    const order = await this.ordersService.update(id, dto);
    return toOrderDto(order);
  }
}
