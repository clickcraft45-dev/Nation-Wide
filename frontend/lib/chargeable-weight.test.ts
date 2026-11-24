import { describe, expect, it } from "vitest";
import { boxChargeableWeightKg, chargeableWeightKg } from "@nationwide/shared-types";

// 50 × 50 × 60 cm ÷ 5000 = 30 kg volumetric; 50 × 50 × 50 cm ÷ 5000 = 25 kg.
const box1 = { weightKg: 25, lengthCm: 50, widthCm: 50, heightCm: 60 };
const box2 = { weightKg: 30, lengthCm: 50, widthCm: 50, heightCm: 50 };

describe("chargeable weight", () => {
  it("charges a box at its volumetric weight when that is higher", () => {
    expect(boxChargeableWeightKg(box1)).toBe(30);
  });

  it("charges a box at its actual weight when that is higher", () => {
    expect(boxChargeableWeightKg(box2)).toBe(30);
  });

  it("adds the boxes' own chargeable weights", () => {
    expect(chargeableWeightKg([box1, box2])).toBe(60);
  });

  it("charges a document envelope with no dimensions on its weight", () => {
    expect(chargeableWeightKg([{ weightKg: 0.5 }])).toBe(0.5);
  });
});
