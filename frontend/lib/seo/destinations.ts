/**
 * Destinations with their own landing page (/courier-to/[slug]).
 *
 * Chosen for search volume from India, not alphabet. Only facts already stated in
 * /shipping-guidelines go in `notes`; no prices or transit times appear here because those come
 * from live rate cards and a stale number on a static page would be worse than none.
 */
export interface Destination {
  slug: string;
  name: string;
  /** ISO 3166-1 alpha-2, for the flag. */
  code: string;
  /** Route-specific rules, taken from the shipping guidelines. Empty when nothing special applies. */
  notes: string[];
}

export const DESTINATIONS: readonly Destination[] = [
  { slug: "usa", name: "USA", code: "US", notes: ["Rice is not accepted for the USA."] },
  { slug: "uk", name: "the United Kingdom", code: "GB", notes: [] },
  { slug: "canada", name: "Canada", code: "CA", notes: ["Rice is not accepted for Canada."] },
  { slug: "australia", name: "Australia", code: "AU", notes: [] },
  { slug: "uae", name: "the UAE", code: "AE", notes: [] },
  {
    slug: "singapore",
    name: "Singapore",
    code: "SG",
    notes: ["Singapore controls CDs, books, medicines, milk products and perishables."],
  },
  { slug: "germany", name: "Germany", code: "DE", notes: [] },
  { slug: "new-zealand", name: "New Zealand", code: "NZ", notes: [] },
  {
    slug: "saudi-arabia",
    name: "Saudi Arabia",
    code: "SA",
    notes: ["Foodstuffs are not accepted for Saudi Arabia."],
  },
  { slug: "malaysia", name: "Malaysia", code: "MY", notes: [] },
] as const;

export function findDestination(slug: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.slug === slug);
}
