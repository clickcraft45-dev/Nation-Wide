import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CompanySettingsService } from './company-settings.service';
import { RateCardDataService } from './rate-card-data.service';
import { RateCardPdfService } from './rate-card-pdf.service';
import { RateCardDocumentsService } from './rate-card-documents.service';
import { FlagService } from './flag.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [MulterModule.register({}), PricingModule],
  providers: [
    CompanySettingsService,
    RateCardDataService,
    RateCardPdfService,
    RateCardDocumentsService,
    FlagService,
  ],
  exports: [
    CompanySettingsService,
    RateCardDataService,
    RateCardPdfService,
    RateCardDocumentsService,
  ],
})
export class RateCardsModule {}
