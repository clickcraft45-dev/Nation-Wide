import type { CountryDto } from "@nationwide/shared-types";

/**
 * Country search for every destination picker.
 *
 * It runs in the browser over the list the page already holds (a few hundred rows), so a result
 * is one keystroke away with no request, and what a customer types never leaves their device.
 * The query is treated as plain text: it is length-capped, stripped to letters and digits, and
 * never turned into a RegExp, so no input can change how matching behaves.
 *
 * Ranking, best first: the ISO code ("US"), the exact name, a common other name ("USA", "Dubai",
 * "Holland"), the start of the name, the start of any word ("kingdom"), anywhere in the name,
 * then a one- or two-letter typo ("germny"). A region ("Azores (Portugal)", code PT-AZORES) also
 * comes up for its country, listed after the country itself.
 */

const MAX_QUERY = 64;

export function normalizeQuery(value: string): string {
  return value
    .slice(0, MAX_QUERY)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bsaint\b/g, "st")
    .replace(/[’'`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Names people type that are not the list's name for the country: other names, old names,
// abbreviations and the cities people ship to by name. Keyed by ISO code.
const ALIASES: Record<string, string[]> = {
  US: ["usa", "us", "america", "united states of america", "new york"],
  GB: ["uk", "britain", "great britain", "england", "london"],
  AE: ["uae", "emirates", "dubai", "abu dhabi", "sharjah"],
  NL: ["holland", "the netherlands"],
  KR: ["korea", "south korea", "republic of korea"],
  KP: ["north korea"],
  RU: ["russian federation"],
  CZ: ["czech republic"],
  TR: ["turkey", "turkiye"],
  CI: ["ivory coast", "cote divoire"],
  MM: ["burma"],
  SZ: ["swaziland"],
  MK: ["macedonia"],
  VN: ["viet nam"],
  LA: ["laos"],
  IR: ["persia"],
  CD: ["drc", "dr congo", "democratic republic of the congo", "zaire"],
  CG: ["republic of the congo", "congo brazzaville"],
  HK: ["hongkong"],
  MO: ["macao"],
  TW: ["taiwan"],
  SA: ["ksa", "saudi"],
  CH: ["swiss"],
  NZ: ["new zealand"],
  DE: ["deutschland"],
  ES: ["espana"],
  PS: ["palestine"],
  VA: ["vatican"],
  BA: ["bosnia"],
  TL: ["east timor"],
  CV: ["cape verde"],
};

interface Entry {
  country: CountryDto;
  code: string;
  name: string;
  words: string[];
  aliases: string[];
  /** The country a region belongs to: "pt" for PT-AZORES; null for a country. */
  parent: string | null;
}

const indexes = new WeakMap<CountryDto[], Entry[]>();

function indexOf(countries: CountryDto[]): Entry[] {
  let index = indexes.get(countries);
  if (!index) {
    index = countries.map((country) => {
      const name = normalizeQuery(country.name);
      const [base, region] = country.code.toUpperCase().split("-");
      return {
        country,
        code: country.code.toLowerCase(),
        name,
        words: name.split(" "),
        aliases: region ? [] : (ALIASES[base] ?? []).map(normalizeQuery),
        parent: region ? base.toLowerCase() : null,
      };
    });
    indexes.set(countries, index);
  }
  return index;
}

/** Edit distance with adjacent swaps, stopping early once it passes `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

function score(e: Entry, q: string, tokens: string[]): number {
  if (q === e.code) return 100;
  if (q === e.name) return 95;
  if (e.aliases.includes(q)) return 90;
  if (e.name.startsWith(q)) return 80;
  if (e.aliases.some((a) => a.startsWith(q))) return 70;
  if (e.words.some((w) => w.startsWith(q))) return 60;
  // "united king", "virgin us": every word of the query starts a word of the name.
  if (tokens.length > 1 && tokens.every((t) => e.words.some((w) => w.startsWith(t)))) return 55;
  if (q.length >= 3 && e.name.includes(q)) return 40;
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    const near = (s: string) => Math.min(distance(q, s.slice(0, q.length + 1), max), distance(q, s.slice(0, q.length), max));
    // A near miss on the whole name ("netherlnads") beats one on a word of a longer name
    // ("Caribbean Netherlands").
    const whole = Math.min(near(e.name), ...e.aliases.map(near));
    if (whole <= max) return 20 - whole;
    const word = Math.min(...e.words.map(near));
    if (word <= max) return 15 - word;
  }
  return 0;
}

/**
 * The countries matching `query`, best first. An empty query returns the list as given, so a
 * picker shows everything until the customer types.
 */
export function searchCountries(countries: CountryDto[], query: string, limit = 50): CountryDto[] {
  const q = normalizeQuery(query);
  if (!q) return countries;
  const tokens = q.split(" ");
  const index = indexOf(countries);
  const byCode = new Map(index.map((e) => [e.code, e]));

  const hits: { e: Entry; s: number }[] = [];
  for (const e of index) {
    let s = score(e, q, tokens);
    // A region also answers its country's search, just below the country.
    if (e.parent) {
      const parent = byCode.get(e.parent);
      if (parent) s = Math.max(s, Math.min(score(parent, q, tokens), 79) - 1);
    }
    if (s > 0) hits.push({ e, s });
  }
  hits.sort(
    (a, b) =>
      b.s - a.s ||
      Number(a.e.parent !== null) - Number(b.e.parent !== null) ||
      a.e.name.localeCompare(b.e.name),
  );
  return hits.slice(0, limit).map((h) => h.e.country);
}
