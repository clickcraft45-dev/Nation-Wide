import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CustomersModule } from '../customers/customers.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CustomersModule, ShipmentsModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
