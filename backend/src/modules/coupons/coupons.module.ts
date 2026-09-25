import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { AdminCouponsController } from './admin-coupons.controller';

@Module({
  controllers: [AdminCouponsController],
  providers: [CouponsService],
  // OrdersService redeems a code when it records a payment.
  exports: [CouponsService],
})
export class CouponsModule {}
