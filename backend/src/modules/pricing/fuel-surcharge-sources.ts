/**
 * Where each carrier publishes its fuel surcharge, and whether we can actually read it.
 *
 * Only DHL serves the numbers in the HTML. UPS and FedEx return a JavaScript shell to any
 * non-browser request — verified from the production host, not guessed: their pages came back
 * 200 with 244 and 1,771 bytes and no percentage anywhere, while DHL's came back 125 KB with the
 * table in it. Rendering those two would need a headless browser against sites that deliberately
 * block automation, so they stay manual: the admin opens the page and types the number, and the
 * app records who did it and when.
 */
export interface FuelSurchargeSource {
  /** Matches RateProvider.code. */
  providerCode: string;
  url: string;
  /** False when the page cannot be read without a browser — the admin enters the value instead. */
  automatic: boolean;
  /** Shown next to the link so the admin knows what they are looking at. */
  note: string;
}

export const FUEL_SURCHARGE_SOURCES: FuelSurchargeSource[] = [
  {
    providerCode: 'DHL',
    url: 'https://www.dhl.de/en/geschaeftskunden/express/produkte-und-services/zuschlaege/treibstoffzuschlag-air.html',
    automatic: true,
    note: 'DHL Express air surcharge, published weekly by calendar week (CW).',
  },
  {
    providerCode: 'UPS',
    url: 'https://www.ups.com/in/en/support/shipping-support/shipping-costs-rates/fuel-surcharges',
    automatic: false,
    note: 'UPS serves this page to browsers only — open it and enter the percentage.',
  },
  {
    providerCode: 'FEDEX',
    url: 'https://www.fedex.com/en-in/shipping/surcharges.html',
    automatic: false,
    note: 'FedEx serves this page to browsers only — open it and enter the percentage.',
  },
];

export interface ParsedSurcharge {
  percent: number;
  /** What the page called it, e.g. "CW 40" — recorded so a figure can be traced to its row. */
  label: string;
}

/**
 * Reads DHL's weekly table, which lists calendar weeks against percentages, newest first.
 *
 * Takes the FIRST row rather than the highest week number: at a year boundary CW 01 is newer than
 * CW 52, and "highest number wins" would quietly hold the surcharge at last year's value for the
 * first weeks of January.
 */
export function parseDhlFuelSurcharge(html: string): ParsedSurcharge | null {
  // The page writes weeks as "CW 40" / "KW 40" and percentages as "46.25 %" or "46,25 %".
  const pattern =
    /(?:CW|KW)\s*(\d{1,2})[\s\S]{0,400}?(\d{1,2})[.,](\d{2})\s*%/gi;
  const match = pattern.exec(html);
  if (!match) return null;

  const percent = Number(`${match[2]}.${match[3]}`);
  // A surcharge outside this range means the page changed shape and we matched something else —
  // better to report nothing than to write a made-up number onto every future quote.
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null;

  return { percent, label: `CW ${match[1]}` };
}
