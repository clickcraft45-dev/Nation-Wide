import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CustomersModule } from '../customers/customers.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { RoutingModule } from '../routing/routing.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [
    CustomersModule,
    ShipmentsModule,
    NotificationsModule,
    // For the bill raised automatically when an order is marked paid. One-way: InvoicesModule
    // does not import OrdersModule, so there is no cycle to forwardRef around.
    InvoicesModule,
    // And for the receipt that goes with it — the proof of payment, issued alongside the bill.
    ReceiptsModule,
    // Road distance for a cancellation fee — see RoutingService.
    RoutingModule,
    // Discount codes, redeemed when a payment is recorded.
    CouponsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
