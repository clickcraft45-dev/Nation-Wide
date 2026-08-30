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

  /**
   * The price the partner agreed at the door, for the ONE case where the server has nothing to
   * compute from: a pickup whose quote was never rated because no rate card covered it
   * (rateProviderId is null). Anywhere else this field is REJECTED, not ignored — accepting a
   * client-supplied price on a rate-carded shipment would let whoever is holding the partner's
   * phone charge whatever they like and have the system record it as the tariff.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  verifiedPrice?: number;

  @IsOptional()
  @IsString()
  verificationNotes?: string;
}
