import { describe, expect, it } from "vitest";
import { readPastedSurcharges } from "./surcharge-paste";

describe("readPastedSurcharges", () => {
  it("reads DHL's weekly table, newest week first and suggested", () => {
    const { fuel } = readPastedSurcharges("Fuel surcharge\nCW 47\t50.00 %\nCW 46\t49,50 %\n");
    expect(fuel.map((c) => c.value)).toEqual([50, 49.5]);
    expect(fuel[0]).toMatchObject({ suggested: true, context: "CW 47 50.00 %" });
  });

  it("suggests the export figure on a page that lists several services", () => {
    const { fuel } = readPastedSurcharges(
      ["Domestic Express 12.75%", "International Air Export 31.25%", "Import 30.5%"].join("\n"),
    );
    expect(fuel.find((c) => c.suggested)?.value).toBe(31.25);
  });

  it("keeps the row label when the percentage sits alone in a cell", () => {
    const { fuel } = readPastedSurcharges("International Air Export\n31.25%");
    expect(fuel[0].context).toBe("International Air Export · 31.25%");
  });

  it("ignores discounts and taxes", () => {
    expect(readPastedSurcharges("Save 20% on your first shipment\nGST 18%").fuel).toEqual([]);
  });

  it("reads rupee per-kg peak surcharges and only counts other currencies", () => {
    const { pss, foreignPerKg } = readPastedSurcharges(
      "Peak surcharge from India: INR 75.00 per kg\nDemand surcharge ₹ 40/kg\nUSA origin: USD 1.25 per kg",
    );
    expect(pss.map((c) => c.value)).toEqual([75, 40]);
    expect(foreignPerKg).toBe(1);
  });

  it("returns nothing from a page with no figures", () => {
    expect(readPastedSurcharges("Please enable JavaScript")).toEqual({ fuel: [], pss: [], foreignPerKg: 0 });
  });
});
