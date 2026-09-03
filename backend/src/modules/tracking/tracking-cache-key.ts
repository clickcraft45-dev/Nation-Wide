/** Shared with ShipmentsService so a manual override can invalidate the same cache entry. */
export function trackingCacheKey(internalTrackingNumber: string): string {
  return `tracking:${internalTrackingNumber}`;
}
