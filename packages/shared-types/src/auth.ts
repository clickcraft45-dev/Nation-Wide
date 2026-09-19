export const ROLES = ["CUSTOMER", "STAFF", "ADMIN", "PICKUP_PARTNER"] as const;

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
