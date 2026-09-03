import { Controller, Get, UseGuards } from '@nestjs/common';
import type { CountryDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CountriesService } from './countries.service';
import { toCountryDto } from './country.mapper';

// Any authenticated role (no @Roles guard) — the customer quote form needs this to populate
// its destination-country dropdown.
@Controller('countries')
@UseGuards(JwtAuthGuard)
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  async findAllActive(): Promise<CountryDto[]> {
    const countries = await this.countriesService.findAllActive();
    return countries.map(toCountryDto);
  }
}
