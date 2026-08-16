import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminShipmentsController } from './admin-shipments.controller';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminQuotesController } from './admin-quotes.controller';
import { AdminPickupsController } from './admin-pickups.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminRateProvidersController } from './admin-rate-providers.controller';
import { AdminPricingOverviewController } from './admin-pricing-overview.controller';
import { AdminCountriesController } from './admin-countries.controller';
import { AdminZonesController } from './admin-zones.controller';
import { AdminRatesController } from './admin-rates.controller';
import { AdminCompanySettingsController } from './admin-company-settings.controller';
import { AdminRateCardsController } from './admin-rate-cards.controller';
import { PickupPartnersController } from './pickup-partners.controller';
import { PickupPartnersService } from './pickup-partners.service';
import { AdminPickupRequestsController } from './admin-pickup-requests.controller';
import { AdminService } from './admin.service';
import { ShipmentsModule } from '../shipments/shipments.module';
import { QuotesModule } from '../quotes/quotes.module';
import { PickupsModule } from '../pickups/pickups.module';
import { OrdersModule } from '../orders/orders.module';
import { PricingModule } from '../pricing/pricing.module';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { PickupRequestsModule } from '../pickup-requests/pickup-requests.module';

@Module({
  imports: [
    ShipmentsModule,
    QuotesModule,
    PickupsModule,
    OrdersModule,
    PricingModule,
    RateCardsModule,
    PickupRequestsModule,
  ],
  controllers: [
    AdminController,
    AdminShipmentsController,
    AdminIntegrationsController,
    AdminAuditLogsController,
    AdminQuotesController,
    AdminPickupsController,
    AdminOrdersController,
    AdminRateProvidersController,
    AdminPricingOverviewController,
    AdminCountriesController,
    AdminZonesController,
    AdminRatesController,
    AdminCompanySettingsController,
    AdminRateCardsController,
    PickupPartnersController,
    AdminPickupRequestsController,
  ],
  providers: [AdminService, PickupPartnersService],
})
export class AdminModule {}
