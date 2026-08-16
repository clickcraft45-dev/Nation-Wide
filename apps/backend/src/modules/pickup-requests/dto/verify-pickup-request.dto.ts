import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import {
  SHIPMENT_TYPES,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';

// Persists the verification — the server re-runs the pricing engine itself from these inputs
// (never trusts a client-echoed price from the earlier stateless recalculate() preview).
export class VerifyPickupRequestDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  verifiedWeightKg!: number;

  @IsIn(SHIPMENT_TYPES)
  verifiedShipmentType!: ShipmentTypeCode;

  @IsOptional()
  @IsString()
  verificationNotes?: string;
}
