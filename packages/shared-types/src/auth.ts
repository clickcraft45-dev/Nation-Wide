// SUPER_ADMIN sits above ADMIN and may do everything it can (see RolesGuard). STAFF was
// retired — those accounts are ADMINs now.
export const ROLES = ["CUSTOMER", "ADMIN", "SUPER_ADMIN", "PICKUP_PARTNER"] as const;

export type Role = (typeof ROLES)[number];

export interface AuthUserDto {
  id: string;
  email: string;
  role: Role;
  /** CUSTOMER only: a business account, which the login page sends to the B2B portal. */
  isB2b?: boolean;
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}
