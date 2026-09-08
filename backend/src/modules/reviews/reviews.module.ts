import { Global, Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { AdminReviewsController } from './admin-reviews.controller';

// Global so both paths that can mark a shipment DELIVERED — ShipmentsService.overrideTrackingStatus
// and TrackingService's provider sync — can request feedback without either importing this module.
@Global()
@Module({
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
