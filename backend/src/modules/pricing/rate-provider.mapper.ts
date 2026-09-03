import type { RateProvider } from '@prisma/client';
import type { RateProviderDto } from '@nationwide/shared-types';

type ProviderWithOptionalCount = RateProvider & {
  _count?: { zoneCountries: number };
};

export function toRateProviderDto(
  provider: ProviderWithOptionalCount,
): RateProviderDto {
  return {
    id: provider.id,
    code: provider.code,
    name: provider.name,
    isActive: provider.isActive,
    fuelChargePercent: provider.fuelChargePercent,
    pssPerKg: provider.pssPerKg,
    activeCountryCount: provider._count?.zoneCountries ?? 0,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}
