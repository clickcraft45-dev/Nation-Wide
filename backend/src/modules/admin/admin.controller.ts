import { Controller, Get, UseGuards } from '@nestjs/common';
import type { DashboardSummaryDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('ping')
  @Roles('STAFF', 'ADMIN')
  ping(@CurrentUser() user: JwtPayload): { message: string; user: JwtPayload } {
    return { message: 'pong', user };
  }

  @Get('dashboard-summary')
  @Roles('STAFF', 'ADMIN')
  dashboardSummary(): Promise<DashboardSummaryDto> {
    return this.adminService.getDashboardSummary();
  }
}
