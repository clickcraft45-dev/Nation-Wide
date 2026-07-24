import { Module } from '@nestjs/common';
import { PickupsService } from './pickups.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [PickupsService],
  exports: [PickupsService],
})
export class PickupsModule {}
