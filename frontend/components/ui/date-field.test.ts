import { describe, expect, it } from "vitest";
import { placePopover } from "./date-field";

// A 390x700 phone, and a calendar roughly the size the real one renders at.
const PHONE = { width: 390, height: 700 };
const CAL = { width: 304, height: 380 };

function trigger(top: number, left = 20, width = 160, height = 36) {
  return { top, bottom: top + height, left, right: left + width };
}

describe("placePopover", () => {
  it("opens below the field when there is room", () => {
    expect(placePopover(trigger(100), CAL, PHONE, "start")).toEqual({ top: 144, left: 20 });
  });

  it("flips above the field near the bottom of the screen", () => {
    // Below would end at 500+8+380 = 888, past 700; above starts at 500-8-380 = 112.
    expect(placePopover(trigger(500), CAL, PHONE, "start").top).toBe(112);
  });

  it("pins inside the screen when it fits neither above nor below", () => {
    const short = { width: 390, height: 420 };
    expect(placePopover(trigger(200), CAL, short, "start").top).toBe(420 - 380 - 8);
  });

  it("never runs off the right edge of a narrow screen", () => {
    // A field starting at x=200 would put a 304px calendar out to 504 on a 390px screen.
    expect(placePopover(trigger(100, 200), CAL, PHONE, "start").left).toBe(390 - 304 - 8);
  });

  it("aligns to the right edge of the field for align=end", () => {
    const t = trigger(100, 200, 180); // right edge at 380
    expect(placePopover(t, CAL, PHONE, "end").left).toBe(380 - 304);
  });
});
