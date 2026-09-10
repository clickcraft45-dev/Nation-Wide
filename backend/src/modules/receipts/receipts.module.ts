import { Module } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { AdminReceiptsController } from './admin-receipts.controller';
import { CustomerReceiptsController } from './customer-receipts.controller';
import { PublicReceiptsController } from './public-receipts.controller';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RateCardsModule, NotificationsModule],
  controllers: [
    AdminReceiptsController,
    CustomerReceiptsController,
    PublicReceiptsController,
  ],
  providers: [ReceiptsService, ReceiptPdfService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
