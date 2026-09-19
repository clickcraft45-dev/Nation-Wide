import type { AdminUser } from '@prisma/client';
import type { PickupPartnerDto } from '@nationwide/shared-types';

export function toPickupPartnerDto(partner: AdminUser): PickupPartnerDto {
  return {
    id: partner.id,
    email: partner.email,
    name: partner.name,
    phone: partner.phone,
    isActive: partner.isActive,
    lastLatitude: partner.lastLatitude,
    lastLongitude: partner.lastLongitude,
    locationUpdatedAt: partner.locationUpdatedAt?.toISOString() ?? null,
    createdAt: partner.createdAt.toISOString(),
  };
}
