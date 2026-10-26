import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import {
  AdminAnnouncementsController,
  AnnouncementsController,
} from './announcements.controller';

@Module({
  controllers: [AnnouncementsController, AdminAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
