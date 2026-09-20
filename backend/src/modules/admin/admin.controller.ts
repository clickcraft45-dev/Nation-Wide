import { Controller, Get, UseGuards } from '@nestjs/common';
import type {
  CommandCentreDto,
  DashboardSummaryDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AdminService } from './admin.service';
import { CommandCentreService } from './command-centre.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly commandCentreService: CommandCentreService,
  ) {}

  @Get('ping')
  @Roles('ADMIN')
  ping(@CurrentUser() user: JwtPayload): { message: string; user: JwtPayload } {
    return { message: 'pong', user };
  }

  @Get('dashboard-summary')
  @Roles('ADMIN')
  dashboardSummary(): Promise<DashboardSummaryDto> {
    return this.adminService.getDashboardSummary();
  }

  /**
   * The company-wide picture: money in against money out, where the work is, and who is doing it.
   * SUPER_ADMIN only — it puts payroll, rent and margin on one screen, which is exactly the view
   * an ordinary admin has no business opening.
   */
  @Get('command-centre')
  @Roles('SUPER_ADMIN')
  commandCentre(): Promise<CommandCentreDto> {
    return this.commandCentreService.get();
  }
}
