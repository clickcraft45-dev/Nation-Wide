import { Module } from '@nestjs/common';
import { PickupRequestsController } from './pickup-requests.controller';
import { PartnerPickupRequestsController } from './partner-pickup-requests.controller';
import { PickupRequestsService } from './pickup-requests.service';
import { OrdersModule } from '../orders/orders.module';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrdersModule, PricingModule, NotificationsModule],
  controllers: [PickupRequestsController, PartnerPickupRequestsController],
  providers: [PickupRequestsService],
  exports: [PickupRequestsService],
})
export class PickupRequestsModule {}
