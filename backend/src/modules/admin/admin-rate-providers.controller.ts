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
import type {
  CountryDetailDto,
  ProviderCountryDto,
  RateDto,
  RateProviderDto,
  ShipmentTypeCode,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RateProvidersService } from '../pricing/rate-providers.service';
import { toRateProviderDto } from '../pricing/rate-provider.mapper';
import { RatesService } from '../pricing/rates.service';
import { toRateDto } from '../pricing/rate.mapper';
import { CreateRateProviderDto } from '../pricing/dto/create-rate-provider.dto';
import { UpdateRateProviderDto } from '../pricing/dto/update-rate-provider.dto';

// ADMIN only, not STAFF+ADMIN like the rest of this admin panel — rate providers feed directly
// into the pricing engine, which controls company margin (Section: Rate card RBAC).
@Controller('admin/rate-providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRateProvidersController {
  constructor(
    private readonly rateProvidersService: RateProvidersService,
    private readonly ratesService: RatesService,
  ) {}

  @Get()
  async findAll(): Promise<RateProviderDto[]> {
    const providers = await this.rateProvidersService.findAll();
    return providers.map(toRateProviderDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<RateProviderDto> {
    const provider = await this.rateProvidersService.findOne(id);
    return toRateProviderDto(provider);
  }

  // Every country configured under this provider, with a light rollup of how much rate
  // configuration exists for each — the Providers -> Countries drill-down list.
  @Get(':id/countries')
  async countries(@Param('id') id: string): Promise<ProviderCountryDto[]> {
    return this.rateProvidersService.getCountriesForProvider(id);
  }

  @Get(':id/countries/:countryId')
  async countryDetail(
    @Param('id') id: string,
    @Param('countryId') countryId: string,
  ): Promise<CountryDetailDto> {
    return this.rateProvidersService.getCountryDetail(id, countryId);
  }

  // The weight slabs ("rates") for one (provider, country, shipment type) — the frontend never
  // needs to know a "zone" exists; this resolves it internally.
  @Get(':id/countries/:countryId/rates')
  async countryRates(
    @Param('id') id: string,
    @Param('countryId') countryId: string,
    @Query('shipmentType') shipmentType: ShipmentTypeCode,
  ): Promise<RateDto[]> {
    const rates = await this.ratesService.findForProviderCountry(
      id,
      countryId,
      shipmentType,
    );
    return rates.map(toRateDto);
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
    @CurrentUser() user: JwtPayload,
  ): Promise<RateProviderDto> {
    const provider = await this.rateProvidersService.update(id, dto, user.sub);
    return toRateProviderDto(provider);
  }
}
