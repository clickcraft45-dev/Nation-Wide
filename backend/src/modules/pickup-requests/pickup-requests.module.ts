import { Module } from '@nestjs/common';
import { PickupRequestsController } from './pickup-requests.controller';
import { PartnerPickupRequestsController } from './partner-pickup-requests.controller';
import { PickupRequestsService } from './pickup-requests.service';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { PushModule } from '../push/push.module';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    OrdersModule,
    PricingModule,
    NotificationsModule,
    // For the bill and the receipt raised when a partner accepts a parcel they were paid for.
    InvoicesModule,
    ReceiptsModule,
    PushModule,
  ],
  controllers: [PickupRequestsController, PartnerPickupRequestsController],
  providers: [PickupRequestsService],
  exports: [PickupRequestsService],
})
export class PickupRequestsModule {}
