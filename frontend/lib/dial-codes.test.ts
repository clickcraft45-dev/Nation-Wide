import { describe, expect, it } from "vitest";
import { FALLBACK_DIAL_COUNTRIES, fromE164, toE164 } from "./dial-codes";

describe("toE164", () => {
  it("joins the dial code to the national digits", () => {
    expect(toE164("+91", "9876543210")).toBe("+919876543210");
  });

  it("strips separators a user pastes in", () => {
    expect(toE164("+44", "20 7946 0958")).toBe("+442079460958");
  });

  it("is empty when there is no national number, not a bare dial code", () => {
    // "+91" alone would fail the API's E.164 check and, worse, look like a filled-in field.
    expect(toE164("+91", "")).toBe("");
  });
});

describe("fromE164", () => {
  it("splits a stored number back into country and national parts", () => {
    expect(fromE164("+919876543210", FALLBACK_DIAL_COUNTRIES)).toEqual({
      countryCode: "IN",
      nationalNumber: "9876543210",
    });
  });

  it("prefers the longest matching dial code", () => {
    // +971 must not be matched as +9 or +97 by an earlier entry in the list.
    expect(fromE164("+971501234567", FALLBACK_DIAL_COUNTRIES).countryCode).toBe("AE");
  });

  it("keeps an unrecognised number visible instead of blanking it", () => {
    expect(fromE164("+99912345", FALLBACK_DIAL_COUNTRIES)).toEqual({
      countryCode: "IN",
      nationalNumber: "99912345",
    });
  });

  it("handles a legacy value stored without a plus", () => {
    expect(fromE164("9876543210", FALLBACK_DIAL_COUNTRIES).nationalNumber).toBe("9876543210");
  });
});
