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
    weightFromKg: rate.weightFromKg,
    weightToKg: rate.weightToKg,
    baseRate: rate.baseRate,
    gstPercent: rate.gstPercent,
    nationwideCut: rate.nationwideCut,
    isActive: rate.isActive,
    createdByAdminEmail: rate.createdBy?.email ?? null,
    updatedByAdminEmail: rate.updatedBy?.email ?? null,
    createdAt: rate.createdAt.toISOString(),
    updatedAt: rate.updatedAt.toISOString(),
  };
}
