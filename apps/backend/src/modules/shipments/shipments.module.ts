import { Module } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';

@Module({
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
