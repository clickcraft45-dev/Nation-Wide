import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminShipmentsController } from './admin-shipments.controller';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminQuotesController } from './admin-quotes.controller';
import { AdminPickupsController } from './admin-pickups.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminService } from './admin.service';
import { ShipmentsModule } from '../shipments/shipments.module';
import { QuotesModule } from '../quotes/quotes.module';
import { PickupsModule } from '../pickups/pickups.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [ShipmentsModule, QuotesModule, PickupsModule, OrdersModule],
  controllers: [
    AdminController,
    AdminShipmentsController,
    AdminIntegrationsController,
    AdminAuditLogsController,
    AdminQuotesController,
    AdminPickupsController,
    AdminOrdersController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
