/**
 * Where each carrier publishes its fuel surcharge, and whether we can actually read it.
 *
 * Only DHL serves the numbers in the HTML, and FuelSurchargeScheduler applies its current week
 * each morning. UPS and FedEx put their pages behind a bot firewall: checked again on 25 Nov 2026,
 * both answered a server request with "Access Denied" (UPS 246 bytes, FedEx 1,757) while DHL's
 * came back 129 KB with the table in it. Getting past that would mean evading a block the carriers
 * set on purpose, so those two stay with the admin: they paste the page they opened in their own
 * browser (surcharge-paste on the Fuel & PSS screen) or type the number, and the app records who.
 */
interface FuelSurchargeSource {
  /** Matches RateProvider.code. */
  providerCode: string;
  url: string;
  /** False when the page cannot be read without a browser — the admin enters the value instead. */
  automatic: boolean;
  /** Shown next to the link so the admin knows what they are looking at. */
  note: string;
}

const DHL_EXPRESS_FUEL_PAGE =
  'https://www.dhl.de/en/geschaeftskunden/express/alles-rund-um-dhl-express/leistungen-services/zuschlaege/treibstoffzuschlag-air.html';

export const FUEL_SURCHARGE_SOURCES: FuelSurchargeSource[] = [
  {
    providerCode: 'DHL',
    url: DHL_EXPRESS_FUEL_PAGE,
    automatic: true,
    note: 'DHL Express air surcharge, published weekly by calendar week (CW). Applied automatically each morning.',
  },
  {
    // The same published surcharge: DHL Express is the product that page prices.
    providerCode: 'DHL_EXPRESS',
    url: DHL_EXPRESS_FUEL_PAGE,
    automatic: true,
    note: 'DHL Express air surcharge, published weekly by calendar week (CW). Applied automatically each morning.',
  },
  {
    providerCode: 'UPS',
    url: 'https://www.ups.com/in/en/support/shipping-support/shipping-costs-rates/fuel-surcharges',
    automatic: false,
    note: 'UPS refuses requests from servers. Open the page, copy it and paste it under "Fuel and PSS from carrier page", or type the percentage.',
  },
  {
    providerCode: 'FEDEX',
    url: 'https://www.fedex.com/en-in/shipping/surcharges.html',
    automatic: false,
    note: 'FedEx refuses requests from servers. Open the page, copy it and paste it under "Fuel and PSS from carrier page", or type the percentage.',
  },
];

interface ParsedSurcharge {
  percent: number;
  /** What the page called it, e.g. "CW 40" — recorded so a figure can be traced to its row. */
  label: string;
}

/** ISO 8601 week number, the "CW" DHL's table is keyed by. */
export function isoWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Thursday decides the year a week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/**
 * Reads DHL's weekly table, which lists calendar weeks against percentages, newest first.
 *
 * DHL publishes the coming week a few days ahead, so the top row is often NEXT week (seen live:
 * CW 49 above CW 48 on a CW 48 Wednesday). The row for the current week is taken; only when the
 * page has no such row does the first row stand in. Matching the week number rather than taking
 * the highest also keeps CW 01 newer than CW 52 at a year boundary.
 */
export function parseDhlFuelSurcharge(
  html: string,
  now: Date = new Date(),
): ParsedSurcharge | null {
  // The page writes weeks as "CW 40" / "KW 40" and percentages as "46.25 %" or "46,25 %".
  const pattern =
    /(?:CW|KW)\s*(\d{1,2})[\s\S]{0,400}?(\d{1,2})[.,](\d{2})\s*%/gi;
  const rows = [...html.matchAll(pattern)].map((m) => ({
    week: Number(m[1]),
    percent: Number(`${m[2]}.${m[3]}`),
  }));
  if (rows.length === 0) return null;

  const thisWeek = isoWeek(now);
  const row = rows.find((r) => r.week === thisWeek) ?? rows[0];
  // A surcharge outside this range means the page changed shape and we matched something else —
  // better to report nothing than to write a made-up number onto every future quote.
  if (!Number.isFinite(row.percent) || row.percent <= 0 || row.percent > 100) {
    return null;
  }
  return {
    percent: row.percent,
    label: `CW ${String(row.week).padStart(2, '0')}`,
  };
}
