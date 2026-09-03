import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuditLogEntryDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminAuditLogsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  list(@Query() query: QueryAuditLogsDto): Promise<AuditLogEntryDto[]> {
    return this.adminService.listAuditLogs(query);
  }
}
