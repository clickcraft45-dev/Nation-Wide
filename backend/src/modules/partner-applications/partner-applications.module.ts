import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { PartnerApplicationsService } from './partner-applications.service';
import { PartnerApplicationsController } from './partner-applications.controller';
import { AdminPartnerApplicationsController } from './admin-partner-applications.controller';

@Module({
  // For PickupPartnersService, which is what actually mints the account on approval.
  imports: [AdminModule],
  controllers: [
    PartnerApplicationsController,
    AdminPartnerApplicationsController,
  ],
  providers: [PartnerApplicationsService],
})
export class PartnerApplicationsModule {}
