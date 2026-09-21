import { Module } from '@nestjs/common';
import { B2bController } from './b2b.controller';
import { AdminB2bLinksController } from './admin-b2b-links.controller';
import { AdminB2bLinksOverviewController } from './admin-b2b-links-overview.controller';
import { B2bLinksService } from './b2b-links.service';
import { B2bAccountsService } from './b2b-accounts.service';
import { B2bAccessGuard } from './b2b-access.guard';
import { PickupRequestsModule } from '../pickup-requests/pickup-requests.module';
import { CustomersModule } from '../customers/customers.module';
import { PricingModule } from '../pricing/pricing.module';
import { QuotesModule } from '../quotes/quotes.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    // Booking a batch, the saved addresses/items it reuses, the country list, and the same
    // stateless price preview the customer wizard uses.
    PickupRequestsModule,
    CustomersModule,
    PricingModule,
    QuotesModule,
    // The invite email that brings a business onto the portal.
    MailModule,
  ],
  controllers: [
    B2bController,
    AdminB2bLinksController,
    AdminB2bLinksOverviewController,
  ],
  providers: [B2bLinksService, B2bAccountsService, B2bAccessGuard],
  exports: [B2bLinksService, B2bAccountsService],
})
export class B2bModule {}
