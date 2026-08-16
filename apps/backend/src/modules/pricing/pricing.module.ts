import { Module } from '@nestjs/common';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { RateProvidersService } from './rate-providers.service';
import { ZonesService } from './zones.service';
import { RatesService } from './rates.service';
import { PricingEngineService } from './pricing-engine.service';
import { PricingOverviewService } from './pricing-overview.service';

@Module({
  controllers: [CountriesController],
  providers: [
    CountriesService,
    RateProvidersService,
    ZonesService,
    RatesService,
    PricingEngineService,
    PricingOverviewService,
  ],
  exports: [
    CountriesService,
    RateProvidersService,
    ZonesService,
    RatesService,
    PricingEngineService,
    PricingOverviewService,
  ],
})
export class PricingModule {}
