import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  PartnerApplication,
  PartnerApplicationStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PartnerApplicationsService } from './partner-applications.service';
import {
  ApprovePartnerApplicationDto,
  RejectPartnerApplicationDto,
} from './dto/review-partner-application.dto';

/**
 * The privileged half of partner onboarding. Approving here is the ONLY path from a public
 * submission to a PICKUP_PARTNER account, which is what keeps that role un-self-servable.
 */
@Controller('admin/partner-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminPartnerApplicationsController {
  constructor(private readonly service: PartnerApplicationsService) {}

  @Get()
  findAll(
    @Query('status') status?: PartnerApplicationStatus,
  ): Promise<PartnerApplication[]> {
    return this.service.findAll(status);
  }

  @Patch(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApprovePartnerApplicationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PartnerApplication> {
    return this.service.approve(id, dto, user.sub);
  }

  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectPartnerApplicationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PartnerApplication> {
    return this.service.reject(id, dto, user.sub);
  }
}
