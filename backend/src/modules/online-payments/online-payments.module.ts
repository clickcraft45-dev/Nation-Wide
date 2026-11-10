import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OnlinePaymentsService } from './online-payments.service';
import { OnlinePaymentsController } from './online-payments.controller';
import { AdminOnlinePaymentsController } from './admin-online-payments.controller';
import { YoupiWebhookController } from './youpi-webhook.controller';
import { YoupiClient } from './youpi.client';

@Module({
  // One-way: OrdersModule knows nothing about the gateway. A confirmed online payment is
  // recorded through OrdersService.updatePayment like any other.
  imports: [OrdersModule],
  controllers: [
    OnlinePaymentsController,
    AdminOnlinePaymentsController,
    YoupiWebhookController,
  ],
  providers: [OnlinePaymentsService, YoupiClient],
})
export class OnlinePaymentsModule {}
