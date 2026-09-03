/**
 * The visitor's own recent tracking lookups, kept in their browser.
 *
 * localStorage rather than a cookie: this is read only by the client that wrote it, and a cookie
 * would be attached to every single request to the API and the app for no reason. It is also
 * deliberately not on the server — a tracking number is not private to an account (the public
 * lookup needs no sign-in), so "what did I look up" belongs to the device, not to a user record.
 *
 * Every access is wrapped: Safari's private mode throws on setItem, and any of these can come
 * back as junk if something else wrote the key. A failure here must never take a page down, so
 * the fallback is always "no history".
 */

const KEY = "nw.tracking-history";
const LIMIT = 8;

export function readTrackingHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** Moves `trackingNumber` to the front (no duplicates) and returns the new list. */
export function rememberTrackingNumber(trackingNumber: string): string[] {
  const value = trackingNumber.trim();
  if (!value) return readTrackingHistory();

  const next = [value, ...readTrackingHistory().filter((v) => v !== value)].slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked — the list in memory is still correct for this page view.
  }
  return next;
}

export function clearTrackingHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the caller clears its own state regardless.
  }
}
