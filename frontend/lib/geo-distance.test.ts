import { describe, expect, it } from "vitest";
import { distanceKm } from "./google-maps";

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ lat: 17.385, lng: 78.4867 }, { lat: 17.385, lng: 78.4867 })).toBe(0);
  });

  it("measures Hyderabad to Bengaluru at roughly 500 km", () => {
    const km = distanceKm({ lat: 17.385, lng: 78.4867 }, { lat: 12.9716, lng: 77.5946 });
    expect(km).toBeGreaterThan(490);
    expect(km).toBeLessThan(510);
  });
});
