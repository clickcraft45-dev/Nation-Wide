import { describe, expect, it } from "vitest";
import type { TrackingEventDto } from "@nationwide/shared-types";
import { deriveMilestones } from "./tracking-milestones";

const event = (
  status: TrackingEventDto["status"],
  eventTime: string,
): TrackingEventDto => ({ status, eventTime, displayLabel: status, location: null });

describe("deriveMilestones", () => {
  it("marks nothing reached for a parcel with no scans", () => {
    expect(deriveMilestones([]).every((m) => m.reachedAt === null)).toBe(true);
  });

  it("takes the first scan of a repeated status, not the last", () => {
    const milestones = deriveMilestones([
      event("PICKED_UP", "2026-03-20T09:00:00Z"),
      event("IN_TRANSIT", "2026-03-21T06:00:00Z"),
      event("IN_TRANSIT", "2026-03-22T18:00:00Z"),
    ]);
    expect(milestones[1].reachedAt).toBe("2026-03-21T06:00:00Z");
  });

  it("back-fills a milestone the carrier never scanned", () => {
    // No IN_TRANSIT scan at all — it must still show as reached, using the later known time,
    // or the list renders a gap that reads as a lost parcel.
    const milestones = deriveMilestones([
      event("PICKED_UP", "2026-03-20T09:00:00Z"),
      event("OUT_FOR_DELIVERY", "2026-03-22T08:15:00Z"),
    ]);
    expect(milestones.map((m) => m.reachedAt)).toEqual([
      "2026-03-20T09:00:00Z",
      "2026-03-22T08:15:00Z",
      "2026-03-22T08:15:00Z",
      null,
    ]);
  });

  it("leaves later milestones pending", () => {
    const milestones = deriveMilestones([event("PICKED_UP", "2026-03-20T09:00:00Z")]);
    expect(milestones[3].reachedAt).toBeNull();
  });

  it("ignores an exception rather than advancing the journey", () => {
    const milestones = deriveMilestones([
      event("PICKED_UP", "2026-03-20T09:00:00Z"),
      event("EXCEPTION", "2026-03-21T11:00:00Z"),
    ]);
    expect(milestones[1].reachedAt).toBeNull();
  });

  it("orders by time even when the carrier returns scans out of order", () => {
    const milestones = deriveMilestones([
      event("IN_TRANSIT", "2026-03-22T18:00:00Z"),
      event("IN_TRANSIT", "2026-03-21T06:00:00Z"),
    ]);
    expect(milestones[1].reachedAt).toBe("2026-03-21T06:00:00Z");
  });
});
