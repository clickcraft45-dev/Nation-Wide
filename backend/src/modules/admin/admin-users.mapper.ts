import type { AdminUser } from '@prisma/client';
import type { AdminUserDto } from '@nationwide/shared-types';

/**
 * Field-by-field, never a spread. A spread would put passwordHash and hashedRefreshToken on the
 * wire the moment either column is added to a query — this shape is the boundary that stops it.
 */
export function toAdminUserDto(user: AdminUser): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role as 'STAFF' | 'ADMIN',
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
