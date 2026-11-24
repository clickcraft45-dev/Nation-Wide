import { Module } from '@nestjs/common';
import { PincodesController } from './pincodes.controller';
import { PincodesService } from './pincodes.service';
import { PostalCodesController } from './postal-codes.controller';
import { PostalCodesService } from './postal-codes.service';

@Module({
  controllers: [PincodesController, PostalCodesController],
  providers: [PincodesService, PostalCodesService],
  exports: [PincodesService, PostalCodesService],
})
export class PincodesModule {}
