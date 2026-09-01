import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { AdminInvoicesController } from './admin-invoices.controller';
import { PublicInvoicesController } from './public-invoices.controller';
import { CustomerInvoicesController } from './customer-invoices.controller';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RateCardsModule, NotificationsModule],
  controllers: [
    AdminInvoicesController,
    CustomerInvoicesController,
    PublicInvoicesController,
  ],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
