import { describe, expect, it } from "vitest";
import type { CountryDto } from "@nationwide/shared-types";
import seed from "../../backend/prisma/data/countries.json";
import { normalizeQuery, searchCountries } from "./country-search";

// The list production is seeded with, plus a region the rate-sheet importer adds.
const COUNTRIES: CountryDto[] = [
  ...(seed as { code: string; name: string }[]),
  { code: "PT-AZORES", name: "Azores (Portugal)" },
].map((c) => ({ ...c, id: c.code, isActive: true }) as CountryDto);

const top = (query: string, n = 1) => searchCountries(COUNTRIES, query).slice(0, n).map((c) => c.code);

describe("searchCountries", () => {
  it("puts the ISO code and the exact name first", () => {
    expect(top("us")).toEqual(["US"]);
    expect(top("IN")).toEqual(["IN"]);
    expect(top("india")).toEqual(["IN"]);
  });

  it("knows the names people type that the list spells differently", () => {
    expect(top("USA")).toEqual(["US"]);
    expect(top("U.S.A.")).toEqual(["US"]);
    expect(top("uk")).toEqual(["GB"]);
    expect(top("dubai")).toEqual(["AE"]);
    expect(top("holland")).toEqual(["NL"]);
  });

  it("matches the start of any word, and every word of a longer query", () => {
    expect(top("kingdom")).toEqual(["GB"]);
    expect(top("united k")).toEqual(["GB"]);
    expect(top("virgin u")).toEqual(["VI"]);
  });

  it("forgives a typo or two", () => {
    expect(top("germny")).toEqual(["DE"]);
    expect(top("phillipines")).toEqual(["PH"]);
    expect(top("netherlnads")).toEqual(["NL"]);
  });

  it("ignores accents and case", () => {
    expect(top("CÔTE")).toEqual(["CI"]);
  });

  it("lists a region under its own name and just after its country", () => {
    expect(top("azores")).toEqual(["PT-AZORES"]);
    expect(top("portugal", 2)).toEqual(["PT", "PT-AZORES"]);
  });

  it("returns the whole list for an empty query and nothing for nonsense", () => {
    expect(searchCountries(COUNTRIES, "  ")).toHaveLength(COUNTRIES.length);
    expect(searchCountries(COUNTRIES, "zzqx")).toEqual([]);
  });

  it("treats every query as plain text", () => {
    // Regex syntax, markup and an absurd length are just characters to it.
    expect(() => searchCountries(COUNTRIES, "(.*[")).not.toThrow();
    expect(searchCountries(COUNTRIES, "<script>")).toEqual([]);
    expect(normalizeQuery("a".repeat(10_000))).toHaveLength(64);
  });
});
