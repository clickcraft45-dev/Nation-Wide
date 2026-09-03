import type { Role } from '@nationwide/shared-types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface JwtPayloadWithRefreshToken extends JwtPayload {
  refreshToken: string;
}
