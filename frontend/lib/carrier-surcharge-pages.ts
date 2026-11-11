/**
 * Where each carrier NationWide resells publishes the two figures a provider needs: its fuel
 * surcharge and its PSS (what each carrier calls its demand or peak surcharge). The fuel pages are
 * the ones the backend checks (fuel-surcharge-sources.ts).
 */
const SURCHARGE_PAGES: Record<string, { fuel: string; pss: string }> = {
  DHL: {
    fuel: "https://www.dhl.com/in-en/home/important-information/2026/express-fuel-surcharge-updates.html",
    pss: "https://www.dhl.com/us-en/home/express/products-and-solutions/products-and-services-overview/surcharges/demand-surcharge.html",
  },
  UPS: {
    fuel: "https://www.ups.com/in/en/support/shipping-support/shipping-costs-rates/fuel-surcharges",
    pss: "https://www.ups.com/in/en/support/shipping-support/shipping-costs-rates",
  },
  FEDEX: {
    fuel: "https://www.fedex.com/en-in/shipping/surcharges.html",
    pss: "https://www.fedex.com/en-in/shipping/surcharges/demand-surcharge.html",
  },
};

/** DHL_EXPRESS reads DHL's pages, as the rate-sheet import does. Null for a carrier not listed. */
export function surchargePagesFor(code: string): { fuel: string; pss: string } | null {
  return SURCHARGE_PAGES[code.trim().toUpperCase().split("_")[0]] ?? null;
}
