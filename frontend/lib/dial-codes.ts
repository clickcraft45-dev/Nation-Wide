export interface DialCountry {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** Including the leading "+". */
  dial: string;
}

/**
 * Enough countries to cover this business's real traffic, used until the live list arrives and
 * whenever it cannot. The remote list is the full one; this is not meant to replace it.
 *
 * A bundled fallback rather than a bare loading state on purpose: the sign-up form must stay
 * usable when a third-party API is slow, blocked by a corporate proxy, or simply down. A
 * shipping company losing registrations because restcountries.com had a bad afternoon is a much
 * worse failure than a short country list.
 */
export const FALLBACK_DIAL_COUNTRIES: DialCountry[] = [
  { code: "IN", name: "India", dial: "+91" },
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "NZ", name: "New Zealand", dial: "+64" },
  { code: "QA", name: "Qatar", dial: "+974" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "ZA", name: "South Africa", dial: "+27" },
];

export const DEFAULT_DIAL_COUNTRY = "IN";

// Only the three fields needed are requested — the unfiltered response is several megabytes.
const REST_COUNTRIES_URL =
  "https://restcountries.com/v3.1/all?fields=cca2,name,idd";
const FETCH_TIMEOUT_MS = 6000;

interface RestCountry {
  cca2?: string;
  name?: { common?: string };
  idd?: { root?: string; suffixes?: string[] };
}

/**
 * The dial-code list, fetched live and sorted by country name.
 *
 * Resolves to the bundled fallback on any failure — offline, timeout, a shape change at the
 * other end. It never rejects, because no caller has anything better to do with the error than
 * show the fallback anyway.
 */
export async function fetchDialCountries(): Promise<DialCountry[]> {
  try {
    const res = await fetch(REST_COUNTRIES_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return FALLBACK_DIAL_COUNTRIES;

    const parsed: unknown = await res.json();
    if (!Array.isArray(parsed)) return FALLBACK_DIAL_COUNTRIES;

    const countries = parsed
      .map((entry) => toDialCountry(entry as RestCountry))
      .filter((c): c is DialCountry => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    // A truncated or malformed response is worse than the known-good list.
    return countries.length > 50 ? countries : FALLBACK_DIAL_COUNTRIES;
  } catch {
    return FALLBACK_DIAL_COUNTRIES;
  }
}

/**
 * One country's dial code, or null if it has none usable.
 *
 * `idd` arrives split as a root ("+1", "+7", "+2") plus suffixes ("242", "473"). Countries with
 * several suffixes are the NANP-style shared-root ones; the first is taken, which is correct for
 * an E.164 prefix. Countries with no suffix at all (e.g. a bare "+7") use the root alone.
 */
function toDialCountry(entry: RestCountry): DialCountry | null {
  const code = entry.cca2;
  const name = entry.name?.common;
  const root = entry.idd?.root;
  if (!code || !name || !root) return null;

  const suffix = entry.idd?.suffixes?.[0] ?? "";
  const dial = `${root}${suffix}`;
  // Antarctica and a few territories come back with a root but nothing dialable.
  if (!/^\+\d{1,4}$/.test(dial)) return null;

  return { code, name, dial };
}

/** "+91" + "9876543210" -> "+919876543210". Non-digits in the national part are dropped. */
export function toE164(dial: string, nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, "");
  return digits ? `${dial}${digits}` : "";
}

/**
 * Splits a stored E.164 number back into a country and its national part, so an edit form opens
 * showing the number the way it was entered. Falls back to the default country with the whole
 * value in the national field when nothing matches, which keeps the number visible and editable
 * rather than silently blanking a record.
 */
export function fromE164(
  value: string,
  countries: DialCountry[],
): { countryCode: string; nationalNumber: string } {
  if (!value.startsWith("+")) {
    return { countryCode: DEFAULT_DIAL_COUNTRY, nationalNumber: value.replace(/\D/g, "") };
  }
  // Longest dial code first: +1 would otherwise swallow every +1xxx territory.
  const match = [...countries]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => value.startsWith(c.dial));

  if (!match) {
    return { countryCode: DEFAULT_DIAL_COUNTRY, nationalNumber: value.slice(1) };
  }
  return { countryCode: match.code, nationalNumber: value.slice(match.dial.length) };
}
