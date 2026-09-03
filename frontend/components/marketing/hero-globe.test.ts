import { describe, expect, it } from "vitest";
import { arcPoint, isLand } from "./hero-globe";

const length = (v: { x: number; y: number; z: number }) =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

// Two points 90° apart on the equator.
const A = { x: 1, y: 0, z: 0 };
const B = { x: 0, y: 0, z: 1 };

describe("arcPoint", () => {
  it("starts and ends exactly on the hubs, whatever the altitude", () => {
    expect(arcPoint(A, B, 0, 0.22)).toMatchObject({ x: 1, y: 0, z: 0 });
    const end = arcPoint(A, B, 1, 0.22);
    expect(end.x).toBeCloseTo(0);
    expect(end.z).toBeCloseTo(1);
  });

  it("stays on the sphere at zero altitude and peaks at the midpoint otherwise", () => {
    expect(length(arcPoint(A, B, 0.37, 0))).toBeCloseTo(1);
    expect(length(arcPoint(A, B, 0.5, 0.22))).toBeCloseTo(1.22);
    expect(length(arcPoint(A, B, 0.5, 0.03))).toBeCloseTo(1.03);
  });

  it("falls back to a linear blend for identical points instead of dividing by zero", () => {
    const p = arcPoint(A, A, 0.5, 0);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(p.x).toBeCloseTo(1);
  });
});

describe("isLand", () => {
  it("puts the hubs on land", () => {
    expect(isLand(19.1, 72.9)).toBe(true); // Mumbai
    expect(isLand(17.4, 78.5)).toBe(true); // Hyderabad
    expect(isLand(51.5, -0.1)).toBe(true); // London
    expect(isLand(40.7, -74.0)).toBe(true); // New York
    expect(isLand(-33.9, 151.2)).toBe(true); // Sydney
  });

  it("leaves the open ocean empty", () => {
    expect(isLand(0, -140)).toBe(false); // mid Pacific
    expect(isLand(-30, -20)).toBe(false); // south Atlantic
    expect(isLand(-20, 80)).toBe(false); // Indian Ocean
    expect(isLand(-85, 0)).toBe(false); // south polar ocean
  });
});
