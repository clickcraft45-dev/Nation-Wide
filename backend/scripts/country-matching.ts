/**
 * Matching a carrier's printed country name to a row in the countries table.
 *
 * Shared by every tariff and remote-area importer so one spelling fix benefits all of them —
 * these lists come from the same carriers and repeat the same idiosyncratic spellings.
 */
/**
 * Carrier spellings that resolve to exactly one country, keyed to its ISO code because matching
 * by name is what fails in the first place ("Türkiye" vs "Turkey", "Côte d’Ivoire" vs
 * "Cote d'Ivoire (Ivory Coast)").
 *
 * ONLY unambiguous one-to-one renames belong here. Two categories are deliberately absent:
 *
 *   Sub-territories with their own zone — "Scotland (United Kingdom)", "Azores (Portugal)",
 *   "St. Thomas (US Virgin Islands)", "Puerto Rico - Arecibo". Folding these into the parent
 *   would overwrite the parent's zone with a sub-region's, and several appear more than once
 *   with DIFFERENT zones, so whichever row landed last would silently win.
 *
 *   Split countries — "China South (Fujian & Guangdong)" and "China (Excluding China South)"
 *   carry different zones for one ISO code. The schema allows one zone per country per provider,
 *   so there is no correct answer to pick here.
 *
 * Both are reported as unmatched instead, which leaves them unpriced rather than mispriced.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  'aland island finland': 'AX',
  'antigua and barbuda': 'AG',
  bahama: 'BS',
  'belarus byelorussia': 'BY',
  'bonaire sint eustatius and saba': 'BQ',
  'bonaire st eustatius saba': 'BQ',
  'bosnia and herzegovina': 'BA',
  congo: 'CG',
  'congo brazzaville': 'CG',
  'congo democratic republic of': 'CD',
  'democratic republic of the congo': 'CD',
  'cote d ivoire ivory coast': 'CI',
  'czech republic': 'CZ',
  'east timor': 'TL',
  'faeroe islands': 'FO',
  'hong kong': 'HK',
  'ireland republic of': 'IE',
  'kirghizia kyrgyzstan': 'KG',
  'korea south': 'KR',
  'libyan arab jamahiriya': 'LY',
  macau: 'MO',
  'macau sar china': 'MO',
  macedonia: 'MK',
  'macedonia fyrom': 'MK',
  'micronesia federated states of': 'FM',
  monserrat: 'MS',
  'palestinian territory': 'PS',
  phillipines: 'PH',
  'republic of moldova': 'MD',
  'reunion island': 'RE',
  'russian federation': 'RU',
  'saint lucia': 'LC',
  'st christopher st kitts': 'KN',
  'st kitts and nevis': 'KN',
  'st vincent the grenadines': 'VC',
  swaziland: 'SZ',
  'syrian arab republic': 'SY',
  'tanzania united republic of': 'TZ',
  'united republic of tanzania': 'TZ',
  turkey: 'TR',
  'yemen republic of': 'YE',
  'wallis futuna islands': 'WF',
};


/** Strips parentheticals, footnote markers and punctuation for a forgiving name comparison. */
function normalise(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[*†]/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

/** Pulls a trailing ISO code out of "Afghanistan (AF)", which DHL's sheets print. */
function isoFrom(name: string): string | null {
  const m = name.match(/\(([A-Z]{2})\)\s*$/);
  return m ? m[1] : null;
}

export interface CountryLookup {
  byIso: Map<string, string>;
  byName: Map<string, string>;
}

/** Builds the lookup once per import run. Values are country ids. */
export function buildCountryLookup(
  countries: Array<{ id: string; code: string; name: string }>,
): CountryLookup {
  return {
    byIso: new Map(countries.map((c) => [c.code.toUpperCase(), c.id])),
    byName: new Map(countries.map((c) => [normalise(c.name), c.id])),
  };
}

/**
 * Resolves a printed name to a country id, or null.
 *
 * Order matters: an ISO code printed in the sheet is exact, a curated alias is a human decision,
 * and only then a normalised name match. Returning null rather than a best guess is the point —
 * a wrong country assignment prices a real shipment against the wrong zone.
 */
export function resolveCountry(printed: string, lookup: CountryLookup): string | null {
  const key = normalise(printed);
  const iso = isoFrom(printed) ?? COUNTRY_ALIASES[key];
  return (iso ? lookup.byIso.get(iso) : undefined) ?? lookup.byName.get(key) ?? null;
}

export { normalise, isoFrom, COUNTRY_ALIASES };
