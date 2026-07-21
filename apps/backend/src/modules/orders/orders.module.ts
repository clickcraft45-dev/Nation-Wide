import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CustomersModule } from '../customers/customers.module';
import { ShipmentsModule } from '../shipments/shipments.module';

@Module({
  imports: [CustomersModule, ShipmentsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
