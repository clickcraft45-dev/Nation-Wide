import type { Role } from "@nationwide/shared-types";

interface DecodedAccessToken {
  sub: string;
  email: string;
  role: Role;
}

/**
 * Decodes the JWT payload without verifying the signature — fine for reading display claims
 * client-side (the payload is base64, not encrypted), but never trust this for authorization;
 * the backend independently verifies every request.
 */
export function decodeAccessToken(token: string): DecodedAccessToken | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded: unknown = JSON.parse(json);
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "sub" in decoded &&
      "email" in decoded &&
      "role" in decoded
    ) {
      return decoded as DecodedAccessToken;
    }
    return null;
  } catch {
    return null;
  }
}
