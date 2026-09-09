import type { TrackingEventDto, TrackingStatusCode } from "@nationwide/shared-types";

/**
 * The journey every parcel takes, in order. EXCEPTION is deliberately absent: it is not a stage
 * of the journey but something that can happen during any of them, and slotting it in would
 * imply a delayed parcel had advanced a step.
 */
export const MILESTONE_SEQUENCE = [
  { status: "PICKED_UP", label: "Picked up" },
  { status: "IN_TRANSIT", label: "In transit" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { status: "DELIVERED", label: "Delivered" },
] as const satisfies readonly { status: TrackingStatusCode; label: string }[];

export interface DerivedMilestone {
  label: string;
  /** The event time that reached this milestone, or null if it has not been reached. */
  reachedAt: string | null;
}

/**
 * Collapses a carrier's raw scan list into the four milestones above.
 *
 * Two rules earn their keep here:
 *  - The FIRST event for a status wins, not the last. A parcel scanned "In transit" at every
 *    hub should show when it entered the network, not when it left the final one.
 *  - Reaching a later milestone back-fills the earlier ones. Carriers skip scans — a parcel that
 *    goes straight from "Picked up" to "Out for delivery" never emits "In transit", and leaving
 *    a hole in the middle of the list reads as a lost parcel rather than a quiet carrier. The
 *    back-filled entry carries the later event's time, which is the only time actually known.
 */
export function deriveMilestones(events: TrackingEventDto[]): DerivedMilestone[] {
  const firstTimeByStatus = new Map<string, string>();
  // Oldest first, so the first write for a status is its earliest occurrence.
  const chronological = [...events].sort(
    (a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime(),
  );
  for (const event of chronological) {
    if (!firstTimeByStatus.has(event.status)) {
      firstTimeByStatus.set(event.status, event.eventTime);
    }
  }

  const highestReached = MILESTONE_SEQUENCE.reduce(
    (highest, milestone, i) => (firstTimeByStatus.has(milestone.status) ? i : highest),
    -1,
  );

  return MILESTONE_SEQUENCE.map((milestone, i) => ({
    label: milestone.label,
    reachedAt:
      firstTimeByStatus.get(milestone.status) ??
      (i < highestReached ? nextKnownTime(firstTimeByStatus, i) : null),
  }));
}

/** The time of the earliest later milestone that was actually scanned. */
function nextKnownTime(firstTimeByStatus: Map<string, string>, fromIndex: number): string | null {
  for (let i = fromIndex + 1; i < MILESTONE_SEQUENCE.length; i++) {
    const time = firstTimeByStatus.get(MILESTONE_SEQUENCE[i].status);
    if (time) return time;
  }
  return null;
}
