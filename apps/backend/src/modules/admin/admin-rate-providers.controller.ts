import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { RateProviderDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateProvidersService } from '../pricing/rate-providers.service';
import { toRateProviderDto } from '../pricing/rate-provider.mapper';
import { CreateRateProviderDto } from '../pricing/dto/create-rate-provider.dto';
import { UpdateRateProviderDto } from '../pricing/dto/update-rate-provider.dto';

// ADMIN only, not STAFF+ADMIN like the rest of this admin panel — rate providers feed directly
// into the pricing engine, which controls company margin (Section: Rate card RBAC).
@Controller('admin/rate-providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRateProvidersController {
  constructor(private readonly rateProvidersService: RateProvidersService) {}

  @Get()
  async findAll(): Promise<RateProviderDto[]> {
    const providers = await this.rateProvidersService.findAll();
    return providers.map(toRateProviderDto);
  }

  @Post()
  async create(@Body() dto: CreateRateProviderDto): Promise<RateProviderDto> {
    const provider = await this.rateProvidersService.create(dto);
    return toRateProviderDto(provider);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRateProviderDto,
  ): Promise<RateProviderDto> {
    const provider = await this.rateProvidersService.update(id, dto);
    return toRateProviderDto(provider);
  }
}
