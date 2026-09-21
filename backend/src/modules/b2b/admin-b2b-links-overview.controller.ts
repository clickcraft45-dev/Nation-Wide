import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { B2bLinkOverviewDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { B2bLinksService } from './b2b-links.service';

/**
 * Every B2B link in one place, so "who can order in our name right now" is one screen rather than
 * a walk through every customer.
 *
 * Issuing and revoking stay on the per-customer routes — a link only means anything against the
 * account it bills — so this is read-only by design. ADMIN only, matching them.
 */
@Controller('admin/b2b-links')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminB2bLinksOverviewController {
  constructor(private readonly links: B2bLinksService) {}

  @Get()
  findAll(
    @Query('includeRevoked') includeRevoked?: string,
  ): Promise<B2bLinkOverviewDto[]> {
    return this.links.findAll(includeRevoked === 'true');
  }
}
