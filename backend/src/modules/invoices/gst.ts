/**
 * The tax arithmetic behind a GST invoice. Pure functions, no Prisma, no I/O — this is the part
 * that has to be right, so it is the part kept easiest to test.
 *
 * SCOPE, DELIBERATELY NARROW: nothing here decides *whether* GST applies or at what rate. That
 * was already decided when the shipment was priced and charged (pricing-engine.service.ts steps
 * 5-7), and the invoice's job is to report the tax that was actually collected — not to re-open
 * the question months later against rate cards that may since have changed. What these functions
 * do is take an already-charged amount of tax and split it into the CGST+SGST or IGST columns
 * the invoice format requires.
 */

/** Two-decimal rounding, matching the pricing engine's own `round2`. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Invoice numbering
// ---------------------------------------------------------------------------

/**
 * The Indian financial year a date falls in, as "2026-27". GST requires the invoice series to be
 * consecutive within a financial year, so this is what the sequence resets against.
 *
 * The FY runs 1 April - 31 March. Computed from UTC parts rather than locale-dependent ones: the
 * server may well run in UTC while the business is in IST, and an order placed at 04:00 IST on
 * 1 April must not be invoiced into the previous year because UTC still says 31 March.
 */
export function indianFinancialYear(date: Date, tzOffsetMinutes = 330): string {
  const local = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  const year = local.getUTCFullYear();
  // getUTCMonth is 0-based; 3 === April.
  const startYear = local.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** e.g. (42, "2026-27") -> "NW/2026-27/00042". Zero-padded so the series sorts lexically. */
export function formatInvoiceNumber(
  sequenceNumber: number,
  financialYear: string,
  prefix = 'NW',
): string {
  return `${prefix}/${financialYear}/${String(sequenceNumber).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// CGST/SGST vs IGST
// ---------------------------------------------------------------------------

export interface GstSplit {
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
}

/**
 * Splits one already-charged GST amount across the invoice's tax columns.
 *
 * Intra-state (supplier state === place of supply) is CGST + SGST at half the rate each;
 * inter-state is a single IGST line at the full rate. Exactly one of the two pairs is ever
 * non-zero, which is what the `@default(0)` columns on the Invoice model encode.
 *
 * CGST is rounded and SGST is then taken as the REMAINDER rather than rounded independently.
 * Rounding both halves separately lets them sum to a paisa more or less than the tax actually
 * collected (e.g. 9% of 105.55 is 9.4995 twice — round each and you get 19.00 against a real
 * 18.99), and an invoice whose columns don't add up to its own total is one an auditor bounces.
 */
export function splitGst(
  taxableValue: number,
  gstAmount: number,
  isIntraState: boolean,
): GstSplit {
  const totalTax = round2(gstAmount);
  // Derived from the money, not from a passed-in percentage: the rate printed on the invoice must
  // be the rate the amount actually represents, even for a back-derived manual quote.
  const effectiveRate =
    taxableValue === 0 ? 0 : round2((totalTax / taxableValue) * 100);

  if (!isIntraState) {
    return {
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: effectiveRate,
      igstAmount: totalTax,
      totalTax,
    };
  }

  const halfRate = round2(effectiveRate / 2);
  const cgstAmount = round2(totalTax / 2);
  return {
    cgstRate: halfRate,
    cgstAmount,
    sgstRate: halfRate,
    sgstAmount: round2(totalTax - cgstAmount),
    igstRate: 0,
    igstAmount: 0,
    totalTax,
  };
}

// ---------------------------------------------------------------------------
// Where the charged breakdown comes from
// ---------------------------------------------------------------------------

/**
 * Which record supplied the numbers. Recorded on every invoice because the three are not equally
 * precise, and "where did this figure come from" is the first thing anyone asks of a tax document.
 */
export const BREAKDOWN_SOURCES = {
  /** The Pickup Partner verified the weight on site and the price was re-computed and frozen. */
  PICKUP_VERIFICATION: 'PICKUP_VERIFICATION',
  /** The carrier option the customer selected, with the engine's full 7-step breakdown. */
  RATE_OPTION: 'RATE_OPTION',
  /** Staff typed one gross figure with no breakdown; taxable value is back-derived from it. */
  MANUAL_QUOTE_INCLUSIVE: 'MANUAL_QUOTE_INCLUSIVE',
  /** A one-off invoice with no order behind it; the gross figure is the admin's own. */
  CUSTOM: 'CUSTOM',
} as const;

export type BreakdownSource =
  (typeof BREAKDOWN_SOURCES)[keyof typeof BREAKDOWN_SOURCES];

export interface ChargedBreakdown {
  taxableValue: number;
  gstAmount: number;
  /** NationWide Cut and anything else the engine adds AFTER tax, so never part of the tax base. */
  nonTaxableCharges: number;
  totalAmount: number;
  source: BreakdownSource;
}

/** What a caller can offer up about an order; every field may legitimately be missing. */
export interface BreakdownCandidates {
  verified?: {
    taxableSubtotal: number | null;
    gstAmount: number | null;
    nationwideCut: number | null;
    price: number | null;
  } | null;
  rateOption?: {
    taxableSubtotal: number;
    gstAmount: number;
    nationwideCut: number;
    finalPrice: number;
  } | null;
  manualGrossAmount?: number | null;
  /** Only used to back-derive a manual quote; ignored when a real breakdown exists. */
  fallbackGstPercent: number;
}

/**
 * Resolves the one breakdown an invoice should state, in order of how directly it reflects what
 * the customer was actually charged.
 *
 * The on-site verified price wins over the originally-quoted option, because a Pickup Partner
 * re-weighing the parcel is what the customer ultimately paid for. Only when neither exists does
 * it fall back to treating a staff-typed manual quote as a GST-INCLUSIVE gross and working
 * backwards — the least precise of the three, hence its own source tag.
 *
 * Returns null when there is nothing to invoice at all, so the caller can refuse rather than
 * issue a document full of zeroes.
 */
export function resolveChargedBreakdown(
  candidates: BreakdownCandidates,
): ChargedBreakdown | null {
  const { verified, rateOption, manualGrossAmount, fallbackGstPercent } =
    candidates;

  if (
    verified &&
    verified.taxableSubtotal !== null &&
    verified.gstAmount !== null &&
    verified.price !== null
  ) {
    return {
      taxableValue: round2(verified.taxableSubtotal),
      gstAmount: round2(verified.gstAmount),
      nonTaxableCharges: round2(verified.nationwideCut ?? 0),
      totalAmount: round2(verified.price),
      source: BREAKDOWN_SOURCES.PICKUP_VERIFICATION,
    };
  }

  if (rateOption) {
    return {
      taxableValue: round2(rateOption.taxableSubtotal),
      gstAmount: round2(rateOption.gstAmount),
      nonTaxableCharges: round2(rateOption.nationwideCut),
      totalAmount: round2(rateOption.finalPrice),
      source: BREAKDOWN_SOURCES.RATE_OPTION,
    };
  }

  if (manualGrossAmount !== null && manualGrossAmount !== undefined) {
    // Treated as tax-inclusive: staff quote a customer the number the customer pays.
    const taxableValue = round2(
      manualGrossAmount / (1 + fallbackGstPercent / 100),
    );
    return {
      taxableValue,
      // Subtracted rather than computed, so taxable + tax lands exactly on the gross.
      gstAmount: round2(manualGrossAmount - taxableValue),
      nonTaxableCharges: 0,
      totalAmount: round2(manualGrossAmount),
      source: BREAKDOWN_SOURCES.MANUAL_QUOTE_INCLUSIVE,
    };
  }

  return null;
}
