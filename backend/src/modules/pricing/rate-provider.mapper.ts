import type { ProviderMarginBand, RateProvider } from '@prisma/client';
import type { RateProviderDto } from '@nationwide/shared-types';

type ProviderWithOptionalCount = RateProvider & {
  _count?: { zoneCountries: number };
  marginBands?: ProviderMarginBand[];
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
    marginBands: (provider.marginBands ?? [])
      .slice()
      .sort((a, b) => a.fromKg - b.fromKg)
      .map((band) => ({
        id: band.id,
        fromKg: band.fromKg,
        toKg: band.toKg,
        flatAmount: band.flatAmount,
        perKgAmount: band.perKgAmount,
      })),
    activeCountryCount: provider._count?.zoneCountries ?? 0,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}
