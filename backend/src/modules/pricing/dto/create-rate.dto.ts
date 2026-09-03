import { IsIn, IsUUID } from 'class-validator';
import {
  SHIPMENT_TYPES,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';
import { UpsertWeightSlabDto } from './weight-slab.dto';

// OTHER is deliberately excluded — those shipments always short-circuit to manual review before
// any rate lookup, so they can never have a rate.
const RATEABLE_SHIPMENT_TYPES = SHIPMENT_TYPES.filter((t) => t !== 'OTHER');

export class CreateRateDto extends UpsertWeightSlabDto {
  @IsUUID()
  zoneId!: string;

  @IsIn(RATEABLE_SHIPMENT_TYPES)
  shipmentType!: ShipmentTypeCode;
}
