import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { RateDto, RatePreviewResultDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RatesService } from '../pricing/rates.service';
import { PricingEngineService } from '../pricing/pricing-engine.service';
import { toRateDto } from '../pricing/rate.mapper';
import { CreateRateDto } from '../pricing/dto/create-rate.dto';
import { UpdateRateDto } from '../pricing/dto/update-rate.dto';
import { QueryRatesDto } from '../pricing/dto/query-rates.dto';
import { SetRateActiveDto } from '../pricing/dto/set-rate-active.dto';
import { BulkUpdateRatesDto } from '../pricing/dto/bulk-update-rates.dto';
import { PreviewRateDto } from '../pricing/dto/preview-rate.dto';

// ADMIN only — see AdminRateProvidersController for why this admin section is narrower than
// the rest of the panel.
@Controller('admin/rates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRatesController {
  constructor(
    private readonly ratesService: RatesService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryRatesDto): Promise<RateDto[]> {
    const rates = await this.ratesService.findAll(query);
    return rates.map(toRateDto);
  }

  // Registered ahead of :id so "bulk" is never mistaken for a rate id.
  @Patch('bulk')
  async bulkUpdate(
    @Body() dto: BulkUpdateRatesDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RateDto[]> {
    const rates = await this.ratesService.bulkUpdate(dto, user.sub);
    return rates.map(toRateDto);
  }

  // No persistence — live preview of the Individual Rate Editor's "Final Calculated Price",
  // reusing the same 7-step math every real quote uses (PricingEngineService.previewRate).
  @Post('preview')
  async preview(@Body() dto: PreviewRateDto): Promise<RatePreviewResultDto> {
    return this.pricingEngine.previewRate(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<RateDto> {
    const rate = await this.ratesService.findOne(id);
    return toRateDto(rate);
  }

  @Post()
  async create(
    @Body() dto: CreateRateDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RateDto> {
    const rate = await this.ratesService.create(dto, user.sub);
    return toRateDto(rate);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRateDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RateDto> {
    const rate = await this.ratesService.update(id, dto, user.sub);
    return toRateDto(rate);
  }

  @Patch(':id/active')
  async setActive(
    @Param('id') id: string,
    @Body() dto: SetRateActiveDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RateDto> {
    const rate = await this.ratesService.setActive(
      id,
      dto.isActive,
      user.sub,
      dto.reason,
    );
    return toRateDto(rate);
  }
}
