// A readable first-party cookie that remembers whether this browser has a session, so a visitor
// who is not signed in does not send POST /auth/refresh (a guaranteed 401) on every page view.
// It is only a hint: the httpOnly refresh cookie on the API stays the real credential, and a
// stale hint corrects itself on the next refresh attempt.
//
//   "1"     signed in: restore the session on load
//   "0"     signed out: skip the refresh call
//   absent  unknown (first visit, or signed in before this cookie existed): check once

const NAME = "nw_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type SessionHint = "1" | "0" | null;

export function readSessionHint(): SessionHint {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)nw_session=([01])(?:;|$)/);
  return match ? (match[1] as "1" | "0") : null;
}

export function writeSessionHint(signedIn: boolean): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${NAME}=${signedIn ? "1" : "0"}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}
