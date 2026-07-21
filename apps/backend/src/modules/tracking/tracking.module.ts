import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { ProviderIntegrationModule } from '../provider-integration/provider-integration.module';

@Module({
  imports: [ProviderIntegrationModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
