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
import { OrdersService, type OrderWithShipments } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto): Promise<OrderWithShipments> {
    return this.ordersService.create(dto);
  }

  @Get()
  findAll(): Promise<OrderWithShipments[]> {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OrderWithShipments> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderWithShipments> {
    return this.ordersService.update(id, dto);
  }
}
