import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CountryDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CountriesService } from '../pricing/countries.service';
import { toCountryDto } from '../pricing/country.mapper';
import { CreateCountryDto } from '../pricing/dto/create-country.dto';
import { UpdateCountryDto } from '../pricing/dto/update-country.dto';

// ADMIN only — see AdminRateProvidersController for why this admin section is narrower than
// the rest of the panel.
@Controller('admin/countries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  async findAll(): Promise<CountryDto[]> {
    const countries = await this.countriesService.findAll();
    return countries.map(toCountryDto);
  }

  @Post()
  async create(@Body() dto: CreateCountryDto): Promise<CountryDto> {
    const country = await this.countriesService.create(dto);
    return toCountryDto(country);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCountryDto,
  ): Promise<CountryDto> {
    const country = await this.countriesService.update(id, dto);
    return toCountryDto(country);
  }
}
