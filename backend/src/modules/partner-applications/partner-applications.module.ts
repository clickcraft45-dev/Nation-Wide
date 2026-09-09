import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { PartnerApplicationsService } from './partner-applications.service';
import { AdminPartnerApplicationsController } from './admin-partner-applications.controller';

@Module({
  // For PickupPartnersService, which is what actually mints the account on approval.
  imports: [AdminModule],
  // The public POST /partner-applications endpoint is gone along with the self-service form —
  // an admin now creates partner accounts directly and the server emails the credentials. The
  // admin controller stays so applications submitted before the change can still be closed out.
  controllers: [AdminPartnerApplicationsController],
  providers: [PartnerApplicationsService],
})
export class PartnerApplicationsModule {}
