import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminShipmentsController } from './admin-shipments.controller';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminService } from './admin.service';
import { ShipmentsModule } from '../shipments/shipments.module';

@Module({
  imports: [ShipmentsModule],
  controllers: [
    AdminController,
    AdminShipmentsController,
    AdminIntegrationsController,
    AdminAuditLogsController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
