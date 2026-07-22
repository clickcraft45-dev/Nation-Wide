import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService, type OrderWithShipments } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Registered ahead of :id so "me" is never swallowed as an :id param. Scoped to the
  // caller's own customerId from the verified JWT — never a client-supplied id.
  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: JwtPayload): Promise<OrderWithShipments[]> {
    return this.ordersService.findAllForCustomer(user.sub);
  }

  @Post()
  @Roles('STAFF', 'ADMIN')
  create(@Body() dto: CreateOrderDto): Promise<OrderWithShipments> {
    return this.ordersService.create(dto);
  }

  @Get()
  @Roles('STAFF', 'ADMIN')
  findAll(): Promise<OrderWithShipments[]> {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @Roles('STAFF', 'ADMIN')
  findOne(@Param('id') id: string): Promise<OrderWithShipments> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  @Roles('STAFF', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderWithShipments> {
    return this.ordersService.update(id, dto);
  }
}
