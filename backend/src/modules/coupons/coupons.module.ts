import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { AdminCouponsController } from './admin-coupons.controller';
import { CouponsController } from './coupons.controller';

@Module({
  controllers: [AdminCouponsController, CouponsController],
  providers: [CouponsService],
  // OrdersService redeems a code when it records a payment.
  exports: [CouponsService],
})
export class CouponsModule {}
