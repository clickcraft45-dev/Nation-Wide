import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import type { OrderDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { OrdersService } from '../orders/orders.service';
import { toOrderDto } from '../orders/order.mapper';
import { UpdateOrderPaymentDto } from './dto/update-order-payment.dto';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

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
