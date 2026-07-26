import { Module } from '@nestjs/common';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { RateProvidersService } from './rate-providers.service';
import { ZonesService } from './zones.service';
import { RatesService } from './rates.service';
import { PricingEngineService } from './pricing-engine.service';

@Module({
  controllers: [CountriesController],
  providers: [
    CountriesService,
    RateProvidersService,
    ZonesService,
    RatesService,
    PricingEngineService,
  ],
  exports: [
    CountriesService,
    RateProvidersService,
    ZonesService,
    RatesService,
    PricingEngineService,
  ],
})
export class PricingModule {}
