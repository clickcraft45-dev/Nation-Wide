import { describe, expect, it } from "vitest";
import { parseAddressComponents, type AddressComponent } from "./google-maps";

const c = (long: string, types: string[], short = long): AddressComponent => ({ long, short, types });

describe("parseAddressComponents", () => {
  it("builds an Indian address with street, locality, state and PIN", () => {
    const parsed = parseAddressComponents(
      [
        c("8-2-293", ["street_number"]),
        c("Road Number 12", ["route"]),
        c("Banjara Hills", ["sublocality_level_1", "sublocality", "political"]),
        c("Hyderabad", ["locality", "political"]),
        c("Telangana", ["administrative_area_level_1", "political"], "TG"),
        c("India", ["country", "political"], "IN"),
        c("500034", ["postal_code"]),
      ],
      "8-2-293, Road Number 12, Banjara Hills, Hyderabad, Telangana 500034, India",
    );
    expect(parsed).toMatchObject({
      addressLine1: "8-2-293 Road Number 12, Banjara Hills",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500034",
      countryCode: "in",
    });
  });

  it("treats the building and sublocalities as line 1 when there is no street", () => {
    const parsed = parseAddressComponents([
      c("Lodha Bellezza", ["premise"]),
      c("KPHB Phase 9", ["sublocality_level_2"]),
      c("Kukatpally", ["sublocality_level_1"]),
      c("Hyderabad", ["locality"]),
    ]);
    expect(parsed.addressLine1).toBe("Lodha Bellezza, KPHB Phase 9, Kukatpally");
  });

  it("falls back to the formatted address when Google only knows the town", () => {
    const parsed = parseAddressComponents(
      [c("Warangal", ["locality"]), c("Telangana", ["administrative_area_level_1"])],
      "Warangal, Telangana, India",
    );
    expect(parsed.addressLine1).toBe("Warangal");
    expect(parsed.city).toBe("Warangal");
  });

  it("uses the postal town where there is no locality (UK)", () => {
    const parsed = parseAddressComponents([
      c("10", ["street_number"]),
      c("Downing Street", ["route"]),
      c("London", ["postal_town"]),
      c("SW1A 2AA", ["postal_code"]),
      c("United Kingdom", ["country"], "GB"),
    ]);
    expect(parsed).toMatchObject({ addressLine1: "10 Downing Street", city: "London", countryCode: "gb" });
  });

  it("does not repeat a part that appears under two types", () => {
    const parsed = parseAddressComponents([
      c("Madhapur", ["sublocality_level_2"]),
      c("Madhapur", ["sublocality_level_1"]),
    ]);
    expect(parsed.addressLine1).toBe("Madhapur");
  });
});
