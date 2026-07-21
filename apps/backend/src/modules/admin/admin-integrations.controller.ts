import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { IntegrationHealthDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminIntegrationsController {
  constructor(private readonly adminService: AdminService) {}

  @Get(':providerCode/health')
  getHealth(
    @Param('providerCode') providerCode: string,
  ): Promise<IntegrationHealthDto> {
    return this.adminService.getIntegrationHealth(providerCode);
  }
}
