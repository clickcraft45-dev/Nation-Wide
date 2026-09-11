import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

// Imported by NotificationsModule (customer pushes ride on every notification) and
// PickupRequestsModule (partner pushes on assignment). Nest instantiates a module once, so the
// controller is registered once however many modules import this.
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
