import { Module } from '@nestjs/common';
import { PincodesController } from './pincodes.controller';
import { PincodesService } from './pincodes.service';
import { PostalCodesController } from './postal-codes.controller';
import { PostalCodesService } from './postal-codes.service';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  controllers: [PincodesController, PostalCodesController, PlacesController],
  providers: [PincodesService, PostalCodesService, PlacesService],
  exports: [PincodesService, PostalCodesService],
})
export class PincodesModule {}
