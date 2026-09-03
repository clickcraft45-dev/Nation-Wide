/**
 * Customer-facing tracking number. Deliberately provider-agnostic — it must never be assumed
 * to equal (or even resemble) a carrier's own tracking number, per Section 5/11.
 *
 * The numeric suffix is the shipment's DB-assigned sequence number (Shipment.sequenceNumber,
 * a Postgres autoincrement column), by product decision: it lets the number itself convey
 * creation order and running parcel volume, rather than being opaque/random. Uniqueness and
 * ordering are guaranteed by the database sequence, not by this function — this is a pure
 * formatter, not a generator.
 */
export function formatInternalTrackingNumber(
  sequenceNumber: number,
  createdAt: Date,
): string {
  const year = createdAt.getUTCFullYear().toString().slice(-2);
  const padded = String(sequenceNumber).padStart(8, '0');
  return `NW-${year}-${padded}`;
}
