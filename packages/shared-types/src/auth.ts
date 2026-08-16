export const ROLES = ["CUSTOMER", "STAFF", "ADMIN", "PICKUP_PARTNER"] as const;

export type Role = (typeof ROLES)[number];

export interface AuthUserDto {
  id: string;
  email: string;
  role: Role;
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}
