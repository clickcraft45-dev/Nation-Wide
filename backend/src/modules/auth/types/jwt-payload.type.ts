import type { Role } from '@nationwide/shared-types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /**
   * CUSTOMER only: a business account. Carried in the token because the frontend restores a
   * session by decoding it (see auth-context), so the post-login destination must be knowable
   * without a second request. It is a routing hint, never an authorisation: the B2B portal
   * re-checks the database on every call (see B2bAccessGuard).
   */
  isB2b?: boolean;
}

export interface JwtPayloadWithRefreshToken extends JwtPayload {
  refreshToken: string;
}
