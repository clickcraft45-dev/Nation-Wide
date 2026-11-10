import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  MyOnlinePaymentsDto,
  OnlineCheckoutDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { OnlinePaymentsService } from './online-payments.service';

// Each call opens a session on the gateway, which serves one payer at a time per UPI account.
// A handful a minute is every honest use; more than that is somebody holding the queue.
const CHECKOUT_THROTTLE = { default: { limit: 6, ttl: 60_000 } };

/**
 * A customer paying what their own order owes.
 *
 * Everything is scoped to the customerId in the verified token, and the amount is never taken
 * from the request: the body is empty on purpose.
 */
@Controller('online-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class OnlinePaymentsController {
  constructor(private readonly onlinePayments: OnlinePaymentsService) {}

  @Get('me')
  findMine(@CurrentUser() user: JwtPayload): Promise<MyOnlinePaymentsDto> {
    return this.onlinePayments.listMine(user.sub);
  }

  @Throttle(CHECKOUT_THROTTLE)
  @Post('me/orders/:orderId/checkout')
  startCheckout(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OnlineCheckoutDto> {
    return this.onlinePayments.startCheckout(orderId, user.sub);
  }
}
