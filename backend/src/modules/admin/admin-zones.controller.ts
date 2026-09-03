import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ZoneDto, ZoneCountryDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZonesService } from '../pricing/zones.service';
import { toZoneDto, toZoneCountryDto } from '../pricing/zone.mapper';
import { CreateZoneDto } from '../pricing/dto/create-zone.dto';
import { UpdateZoneDto } from '../pricing/dto/update-zone.dto';
import { AssignZoneCountryDto } from '../pricing/dto/assign-zone-country.dto';

// ADMIN only — see AdminRateProvidersController for why this admin section is narrower than
// the rest of the panel.
@Controller('admin/zones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get()
  async findAll(
    @Query('rateProviderId') rateProviderId: string,
  ): Promise<ZoneDto[]> {
    const zones = await this.zonesService.findAllForProvider(rateProviderId);
    return zones.map(toZoneDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ZoneDto> {
    const zone = await this.zonesService.findOne(id);
    return toZoneDto(zone);
  }

  @Get(':id/countries')
  async findCountries(@Param('id') id: string): Promise<ZoneCountryDto[]> {
    const zoneCountries = await this.zonesService.findCountries(id);
    return zoneCountries.map(toZoneCountryDto);
  }

  @Post()
  async create(@Body() dto: CreateZoneDto): Promise<ZoneDto> {
    const zone = await this.zonesService.create(dto);
    return toZoneDto(zone);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
  ): Promise<ZoneDto> {
    const zone = await this.zonesService.update(id, dto);
    return toZoneDto(zone);
  }

  @Post(':id/countries')
  @HttpCode(204)
  async assignCountry(
    @Param('id') id: string,
    @Body() dto: AssignZoneCountryDto,
  ): Promise<void> {
    await this.zonesService.assignCountry(id, dto);
  }

  @Delete(':id/countries/:countryId')
  @HttpCode(204)
  async unassignCountry(
    @Param('id') id: string,
    @Param('countryId') countryId: string,
  ): Promise<void> {
    await this.zonesService.unassignCountry(id, countryId);
  }
}
