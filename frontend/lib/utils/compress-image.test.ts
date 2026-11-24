import { describe, expect, it } from "vitest";
import { fitWithin } from "./compress-image";

describe("fitWithin", () => {
  it("scales a 12 MP phone photo down to a 2000 px long edge", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
  });

  it("never enlarges a photo that is already small", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
