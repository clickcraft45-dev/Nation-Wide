import type { ZoneDto, ZoneCountryDto } from '@nationwide/shared-types';
import type { ZoneWithDetails, ZoneCountryWithName } from './zones.service';

export function toZoneDto(zone: ZoneWithDetails): ZoneDto {
  return {
    id: zone.id,
    rateProviderId: zone.rateProviderId,
    rateProviderName: zone.rateProvider.name,
    name: zone.name,
    countryCount: zone._count.countries,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  };
}

export function toZoneCountryDto(
  zoneCountry: ZoneCountryWithName,
): ZoneCountryDto {
  return {
    zoneId: zoneCountry.zoneId,
    countryId: zoneCountry.countryId,
    countryName: zoneCountry.country.name,
  };
}
