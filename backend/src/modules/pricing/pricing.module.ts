import { Module } from '@nestjs/common';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { RateProvidersService } from './rate-providers.service';
import { ZonesService } from './zones.service';
import { RatesService } from './rates.service';
import { PricingEngineService } from './pricing-engine.service';
import { PricingOverviewService } from './pricing-overview.service';
import { PricingSpreadsheetService } from './pricing-spreadsheet.service';
import { FuelSurchargeService } from './fuel-surcharge.service';
import { RateSheetImportService } from './rate-sheet-import.service';

@Module({
  controllers: [CountriesController],
  providers: [
    FuelSurchargeService,
    PricingSpreadsheetService,
    RateSheetImportService,
    CountriesService,
    RateProvidersService,
    ZonesService,
    RatesService,
    PricingEngineService,
    PricingOverviewService,
  ],
  exports: [
    FuelSurchargeService,
    PricingSpreadsheetService,
    RateSheetImportService,
    CountriesService,
    RateProvidersService,
    ZonesService,
    RatesService,
    PricingEngineService,
    PricingOverviewService,
  ],
})
export class PricingModule {}
