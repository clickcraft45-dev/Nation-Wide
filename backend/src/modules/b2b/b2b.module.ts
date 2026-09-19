import { Module } from '@nestjs/common';
import { B2bController } from './b2b.controller';
import { AdminB2bLinksController } from './admin-b2b-links.controller';
import { B2bLinksService } from './b2b-links.service';
import { B2bRequestsService } from './b2b-requests.service';
import {
  AdminB2bRequestsController,
  PublicB2bRequestsController,
} from './b2b-requests.controller';
import { B2bTokenGuard } from './b2b-token.guard';
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
    // The operations alert when a business asks for an account.
    MailModule,
  ],
  controllers: [
    B2bController,
    AdminB2bLinksController,
    PublicB2bRequestsController,
    AdminB2bRequestsController,
  ],
  providers: [B2bLinksService, B2bRequestsService, B2bTokenGuard],
  exports: [B2bLinksService],
})
export class B2bModule {}
