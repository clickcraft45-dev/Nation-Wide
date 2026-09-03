import type { Country } from '@prisma/client';
import type { CountryDto } from '@nationwide/shared-types';

export function toCountryDto(country: Country): CountryDto {
  return {
    id: country.id,
    code: country.code,
    name: country.name,
    isActive: country.isActive,
    createdAt: country.createdAt.toISOString(),
    updatedAt: country.updatedAt.toISOString(),
  };
}
