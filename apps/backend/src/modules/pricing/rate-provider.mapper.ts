import type { RateProvider } from '@prisma/client';
import type { RateProviderDto } from '@nationwide/shared-types';

export function toRateProviderDto(provider: RateProvider): RateProviderDto {
  return {
    id: provider.id,
    code: provider.code,
    name: provider.name,
    isActive: provider.isActive,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}
