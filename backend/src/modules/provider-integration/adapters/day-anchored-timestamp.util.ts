const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Simple, deterministic string hash — used only to spread synthetic timestamps, not for security. */
export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * A deterministic timestamp for statuses a provider doesn't give a real timestamp for.
 * Anchored to the start of the current UTC day (not Date.now()) so repeated polls on the same
 * day for an unchanged status produce an identical eventTime, which TrackingService's
 * dedupe-by-eventTime logic relies on to avoid re-appending "new" events and re-notifying on
 * every cache refresh (see StubShippingProviderAdapter for the original version of this).
 * The rawStatus-derived offset spreads distinct statuses reached on the same day into distinct,
 * strictly increasing timestamps, so a genuine same-day status change is still seen as new.
 */
export function dayAnchoredEventTime(rawStatus: string): Date {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const offset = hashString(rawStatus) % (ONE_DAY_MS - 1);
  return new Date(dayStart.getTime() + offset);
}
