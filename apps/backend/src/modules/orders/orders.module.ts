import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CustomersModule } from '../customers/customers.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [
    CustomersModule,
    ShipmentsModule,
    NotificationsModule,
    // For the bill raised automatically when an order is marked paid. One-way: InvoicesModule
    // does not import OrdersModule, so there is no cycle to forwardRef around.
    InvoicesModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
