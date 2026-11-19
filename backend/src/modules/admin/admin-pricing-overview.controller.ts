import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type {
  PricingDashboardSummaryDto,
  PricingSearchResultDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PricingOverviewService } from '../pricing/pricing-overview.service';
import { PricingSearchQueryDto } from './dto/pricing-search-query.dto';

// ADMIN only — matches the rest of the pricing admin surface (AdminRateProvidersController etc.).
@Controller('admin/pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPricingOverviewController {
  constructor(
    private readonly pricingOverviewService: PricingOverviewService,
  ) {}

  @Get('dashboard-summary')
  getDashboardSummary(): Promise<PricingDashboardSummaryDto> {
    return this.pricingOverviewService.getDashboardSummary();
  }

  @Get('search')
  search(
    @Query() query: PricingSearchQueryDto,
  ): Promise<PricingSearchResultDto[]> {
    return this.pricingOverviewService.search(query.q ?? '');
  }
}
