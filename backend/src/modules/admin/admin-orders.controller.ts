import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CancellationQuoteDto, OrderDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { OrdersService } from '../orders/orders.service';
import { toOrderDto } from '../orders/order.mapper';
import { UpdateOrderPaymentDto } from './dto/update-order-payment.dto';
import { CancelOrderDto } from '../orders/dto/cancel-order.dto';
import { SetOrderReturnedDto } from './dto/set-order-returned.dto';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':id/cancellation-quote')
  quoteCancellation(@Param('id') id: string): Promise<CancellationQuoteDto> {
    return this.ordersService.quoteCancellation(id);
  }

  // Admins cancel on a customer's behalf (a phone call, a pickup that cannot happen) under the
  // same AWB cutoff — once a carrier holds the parcel this is not the way to stop it.
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderDto> {
    const order = await this.ordersService.cancel(id, dto.reason, user.sub);
    return toOrderDto(order);
  }

  // Whether the goods came back, which is a different question from whether the money did — see
  // OrdersService.setReturned.
  @Patch(':id/returned')
  async setReturned(
    @Param('id') id: string,
    @Body() dto: SetOrderReturnedDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderDto> {
    const order = await this.ordersService.setReturned(
      id,
      dto.returned,
      dto.note,
      user.sub,
    );
    return toOrderDto(order);
  }

  @Patch(':id/payment')
  async updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdateOrderPaymentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderDto> {
    const order = await this.ordersService.updatePayment(id, dto, user.sub);
    return toOrderDto(order);
  }
}
