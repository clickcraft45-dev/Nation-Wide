import { randomUUID } from 'node:crypto';

/**
 * Customer-facing tracking number. Deliberately provider-agnostic — it must never be
 * assumed to equal (or even resemble) a carrier's own tracking number, per Section 5/11.
 */
export function generateInternalTrackingNumber(): string {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  return `NW-${suffix}`;
}
