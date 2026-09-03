import {
  BREAKDOWN_SOURCES,
  formatInvoiceNumber,
  indianFinancialYear,
  resolveChargedBreakdown,
  splitGst,
} from './gst';

describe('indianFinancialYear', () => {
  it.each([
    ['2026-04-01T00:00:00.000Z', '2026-27'],
    // 18:29:59Z is 23:59:59 IST on 31 March — the last instant of FY 2026-27. One second later
    // is a new financial year, which is exactly why these fixtures are written in UTC.
    ['2027-03-31T18:29:59.000Z', '2026-27'],
    ['2027-03-31T18:30:00.000Z', '2027-28'],
    ['2026-03-31T00:00:00.000Z', '2025-26'],
    ['2026-12-25T00:00:00.000Z', '2026-27'],
  ])('%s falls in FY %s', (iso, expected) => {
    expect(indianFinancialYear(new Date(iso))).toBe(expected);
  });

  // The regression: a UTC server must not file an early-morning IST order into the wrong year.
  // 2026-03-31T20:00Z is already 01:30 on 1 April in IST, so it belongs to the NEW year.
  it('uses IST, not the server clock, to place a date either side of 1 April', () => {
    expect(indianFinancialYear(new Date('2026-03-31T20:00:00.000Z'))).toBe(
      '2026-27',
    );
    expect(indianFinancialYear(new Date('2026-03-31T17:00:00.000Z'))).toBe(
      '2025-26',
    );
  });
});

describe('formatInvoiceNumber', () => {
  it('zero-pads so the series sorts lexically', () => {
    expect(formatInvoiceNumber(42, '2026-27')).toBe('NW/2026-27/00042');
    expect(
      formatInvoiceNumber(1, '2026-27') < formatInvoiceNumber(10, '2026-27'),
    ).toBe(true);
  });
});

describe('splitGst', () => {
  it('splits an intra-state supply into equal CGST and SGST halves', () => {
    const split = splitGst(600, 108, true);
    expect(split).toMatchObject({
      cgstRate: 9,
      cgstAmount: 54,
      sgstRate: 9,
      sgstAmount: 54,
      igstRate: 0,
      igstAmount: 0,
      totalTax: 108,
    });
  });

  it('puts an inter-state supply entirely in IGST at the full rate', () => {
    const split = splitGst(600, 108, false);
    expect(split).toMatchObject({
      cgstAmount: 0,
      sgstAmount: 0,
      igstRate: 18,
      igstAmount: 108,
      totalTax: 108,
    });
  });

  // The reason SGST is a remainder rather than its own rounded half: rounding both independently
  // makes the two columns sum to more tax than was actually collected.
  it('keeps CGST + SGST exactly equal to the tax charged when the half does not round cleanly', () => {
    const split = splitGst(105.55, 18.99, true);
    expect(split.cgstAmount + split.sgstAmount).toBeCloseTo(18.99, 10);
    expect(split.totalTax).toBe(18.99);
  });

  it('does not divide by zero on a fully non-taxable invoice', () => {
    expect(splitGst(0, 0, true)).toMatchObject({ totalTax: 0, cgstRate: 0 });
  });
});

describe('resolveChargedBreakdown', () => {
  const fallbackGstPercent = 18;

  it('prefers the on-site verified price over the originally quoted option', () => {
    const result = resolveChargedBreakdown({
      verified: {
        taxableSubtotal: 700,
        gstAmount: 126,
        nationwideCut: 100,
        price: 926,
      },
      rateOption: {
        taxableSubtotal: 600,
        gstAmount: 108,
        nationwideCut: 100,
        finalPrice: 808,
      },
      fallbackGstPercent,
    });
    expect(result).toMatchObject({
      taxableValue: 700,
      gstAmount: 126,
      nonTaxableCharges: 100,
      totalAmount: 926,
      source: BREAKDOWN_SOURCES.PICKUP_VERIFICATION,
    });
  });

  it('falls back to the selected rate option when nothing was verified on site', () => {
    const result = resolveChargedBreakdown({
      verified: null,
      rateOption: {
        taxableSubtotal: 600,
        gstAmount: 108,
        nationwideCut: 100,
        finalPrice: 808,
      },
      fallbackGstPercent,
    });
    expect(result?.source).toBe(BREAKDOWN_SOURCES.RATE_OPTION);
    // NationWide Cut is added after tax by the pricing engine, so it must stay out of the base.
    expect(result?.taxableValue).toBe(600);
    expect(result?.nonTaxableCharges).toBe(100);
  });

  it('ignores a half-populated verification rather than inventing the missing half', () => {
    const result = resolveChargedBreakdown({
      verified: {
        taxableSubtotal: null,
        gstAmount: null,
        nationwideCut: null,
        price: 926,
      },
      rateOption: {
        taxableSubtotal: 600,
        gstAmount: 108,
        nationwideCut: 100,
        finalPrice: 808,
      },
      fallbackGstPercent,
    });
    expect(result?.source).toBe(BREAKDOWN_SOURCES.RATE_OPTION);
  });

  it('back-derives a manual quote as tax-inclusive, landing exactly on the gross', () => {
    const result = resolveChargedBreakdown({
      verified: null,
      rateOption: null,
      manualGrossAmount: 1180,
      fallbackGstPercent,
    });
    expect(result).toMatchObject({
      taxableValue: 1000,
      gstAmount: 180,
      source: BREAKDOWN_SOURCES.MANUAL_QUOTE_INCLUSIVE,
    });
    expect(result!.taxableValue + result!.gstAmount).toBeCloseTo(1180, 10);
  });

  it('returns null when there is nothing to invoice, rather than a zeroed document', () => {
    expect(
      resolveChargedBreakdown({
        verified: null,
        rateOption: null,
        manualGrossAmount: null,
        fallbackGstPercent,
      }),
    ).toBeNull();
  });
});

// Whatever the source, the three money columns must reconcile to the total the customer paid —
// an invoice that doesn't add up is worse than no invoice.
describe('every breakdown reconciles', () => {
  it.each([
    [
      'verified',
      {
        verified: {
          taxableSubtotal: 700,
          gstAmount: 126,
          nationwideCut: 100,
          price: 926,
        },
        fallbackGstPercent: 18,
      },
    ],
    [
      'rate option',
      {
        rateOption: {
          taxableSubtotal: 600,
          gstAmount: 108,
          nationwideCut: 100,
          finalPrice: 808,
        },
        fallbackGstPercent: 18,
      },
    ],
    ['manual', { manualGrossAmount: 1180, fallbackGstPercent: 18 }],
  ])('%s: taxable + tax + non-taxable === total', (_label, candidates) => {
    const r = resolveChargedBreakdown(candidates)!;
    expect(r.taxableValue + r.gstAmount + r.nonTaxableCharges).toBeCloseTo(
      r.totalAmount,
      10,
    );
  });
});
