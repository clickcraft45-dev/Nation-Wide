import type { RateDto, ShipmentTypeCode } from '@nationwide/shared-types';
import type { RateWithDetails } from './rates.service';

export function toRateDto(rate: RateWithDetails): RateDto {
  return {
    id: rate.id,
    rateProviderId: rate.rateCard.zone.rateProviderId,
    rateProviderName: rate.rateCard.zone.rateProvider.name,
    zoneId: rate.rateCard.zoneId,
    zoneName: rate.rateCard.zone.name,
    shipmentType: rate.rateCard.shipmentType as ShipmentTypeCode,
    currency: rate.rateCard.currency,
    weightFromKg: rate.weightFromKg.toNumber(),
    weightToKg: rate.weightToKg.toNumber(),
    baseRate: rate.baseRate.toNumber(),
    gstPercent: rate.gstPercent.toNumber(),
    nationwideCut: rate.nationwideCut.toNumber(),
    isActive: rate.isActive,
    createdByAdminEmail: rate.createdBy?.email ?? null,
    updatedByAdminEmail: rate.updatedBy?.email ?? null,
    createdAt: rate.createdAt.toISOString(),
    updatedAt: rate.updatedAt.toISOString(),
  };
}
