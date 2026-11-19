/**
 * Reads fuel and peak (PSS) surcharges out of a carrier page the admin copied from their own
 * browser (Ctrl+A, Ctrl+C on the carrier's page, then paste here).
 *
 * The alternative to fetching: UPS and FedEx refuse server and headless-browser requests, but the
 * page opens fine in the admin's browser, and its text carries the figures. Nothing is guessed:
 * every figure found comes back with the line it was on, and the admin picks the one to apply.
 */

export interface SurchargeCandidate {
  value: number;
  /** The line the figure was on (with the line above when the figure sat alone in a cell). */
  context: string;
  /** Best guess at the figure an Indian exporter pays: export / international / air / express. */
  suggested: boolean;
}

interface PastedSurcharges {
  fuel: SurchargeCandidate[];
  /** Per-kg peak or demand surcharges in rupees, the unit PSS is stored in. */
  pss: SurchargeCandidate[];
  /** Per-kg figures in another currency: shown as a count, never applied. */
  foreignPerKg: number;
}

export const MAX_PASTE = 300_000;
const MAX_CANDIDATES = 30;
const NOT_FUEL = /discount|save|offer|promo|off\b|gst|vat|tax|insurance|duty|commission/i;

// What an Indian exporter pays: export beats international beats air/express; domestic and
// import rows are someone else's surcharge.
function relevance(context: string): number {
  return (
    (/export|outbound/i.test(context) ? 3 : 0) +
    (/international|intl/i.test(context) ? 2 : 0) +
    (/air|express/i.test(context) ? 1 : 0) -
    (/domestic|import|inbound/i.test(context) ? 5 : 0)
  );
}

const num = (text: string) => Number(text.replace(",", "."));

export function readPastedSurcharges(pasted: string): PastedSurcharges {
  const lines = pasted
    .slice(0, MAX_PASTE)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const fuel: SurchargeCandidate[] = [];
  const pss: SurchargeCandidate[] = [];
  let foreignPerKg = 0;
  const seen = new Set<string>();
  const add = (list: SurchargeCandidate[], value: number, context: string) => {
    const key = `${list === fuel ? "f" : "p"}|${value}|${context}`;
    if (seen.has(key) || list.length >= MAX_CANDIDATES) return;
    seen.add(key);
    list.push({ value, context: context.slice(0, 160), suggested: false });
  };

  lines.forEach((line, i) => {
    // A figure alone in a table cell ("49.50 %") means nothing without its row label above it.
    const context = !/[a-z]/i.test(line) && i > 0 ? `${lines[i - 1]} · ${line}` : line;

    for (const m of line.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s?%/g)) {
      const value = num(m[1]);
      if (value > 0 && value <= 100 && !NOT_FUEL.test(context)) add(fuel, value, context);
    }

    const perKg = /(?:(₹|INR|Rs\.?|USD|US\$|\$|EUR|€)\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(₹|INR|Rs\.?|USD|EUR|€))\s*(?:\/|per)\s*(?:kg|kilo)/gi;
    for (const m of line.matchAll(perKg)) {
      const currency = (m[1] ?? m[4] ?? "").toUpperCase();
      const value = num(m[2] ?? m[3]);
      if (!(value > 0)) continue;
      if (/₹|INR|RS/.test(currency)) add(pss, value, context);
      else foreignPerKg += 1;
    }
  });

  for (const list of [fuel, pss]) {
    const best = Math.max(0, ...list.map((c) => relevance(c.context)));
    const pick = list.find((c) => relevance(c.context) === best && best > 0) ?? list[0];
    if (pick) pick.suggested = true;
  }
  return { fuel, pss, foreignPerKg };
}
