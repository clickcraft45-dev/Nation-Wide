import { createElement as h } from 'react';
import { join } from 'node:path';
import type { Invoice } from '@prisma/client';
import {
  customInvoiceLineTotal,
  type CustomInvoiceLineDto,
} from '@nationwide/shared-types';
import {
  brandAsset,
  watermarkImage,
  WATERMARK_STYLE,
} from '../../rate-cards/brand-assets';

// Plain React.createElement, not JSX, and a dynamic ESM import of @react-pdf/renderer — both for
// exactly the reasons spelled out at the top of rate-cards/templates/classic-template.ts. This
// file follows that established pattern rather than inventing a second one.

export interface InvoiceExtras {
  shipments: { trackingNumber: string; providerName: string }[];
  destination: string | null;
  weightKg: number | null;
  /**
   * One printed row per billed order, for a CONSOLIDATED invoice. Absent (or empty) on every
   * other kind, which keeps its single derived line exactly as it was.
   *
   * `amount` is the row's taxable value plus its share of anything charged outside tax — what
   * the customer reconciles against their own record of that shipment. Tax is not shown per row
   * because it is not charged per row; it lands once, on the summed total below the table.
   */
  lines?: { description: string; supplyDate: Date; amount: number }[];
  /** The window a consolidated invoice covers, printed under the invoice number. */
  periodFrom?: Date | null;
  periodTo?: Date | null;
  /**
   * The freight schedule behind a custom invoice: a row per AWB with the charges that make it
   * up. Printed as its own wide table in place of the single derived line, because this is the
   * form the customer already reconciles against — freight, GMR, PSS and fuel kept apart rather
   * than collapsed into one number they would have to take on trust.
   */
  customLines?: CustomInvoiceLineDto[];
}

/**
 * The non-statutory part of an invoice's identity. These values are rendered when the PDF is
 * issued and frozen in the stored file, so later setting changes cannot rewrite tax records.
 */
export interface InvoiceBranding {
  companyName?: string | null;
  tagline?: string | null;
  primaryColor?: string | null;
  logoPath?: string | null;
  website?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  termsAndConditions?: string | null;
  footerNotes?: string | null;
  legalDisclaimer?: string | null;
}

const INK = '#0b0b0c';
const MUTED = '#6b6b72';
const PAPER = '#f6f6f7';
const LINE = '#e4e4e7';
const DANGER = '#b91c1c';
const BRAND_FALLBACK = '#7f1020';

/**
 * The T&C as the admin typed them — one term per line — ready to number. A number the admin typed
 * themselves ("1.", "2)", "-") is stripped so the list is never numbered twice.
 */
export function termLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tail =
    rest < 20
      ? ONES[rest]
      : [TENS[Math.floor(rest / 10)], ONES[rest % 10]]
          .filter(Boolean)
          .join('-');
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', tail]
    .filter(Boolean)
    .join(' ');
}

/** Whole rupees in the Indian system: crore, lakh, thousand. */
function indianWords(n: number): string {
  if (n === 0) return '';
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  return [
    crore ? `${indianWords(crore)} Crore` : '',
    lakh ? `${belowThousand(lakh)} Lakh` : '',
    thousand ? `${belowThousand(thousand)} Thousand` : '',
    belowThousand(n % 1000),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The total spelled out, as Indian invoices print it under the figure: a written amount is the
 * customary guard against a digit being misread or altered on a printed copy.
 */
export function rupeesInWords(amount: number): string {
  const totalPaise = Math.round(Math.abs(amount) * 100);
  const rupees = indianWords(Math.floor(totalPaise / 100)) || 'Zero';
  const paise = totalPaise % 100;
  return `Rupees ${rupees}${paise ? ` and ${belowThousand(paise)} Paise` : ''} Only`;
}

/** "https://www.example.com/admin/x" → "example.com": a letterhead names the site, not a page. */
export function websiteHost(value: string): string {
  try {
    return new URL(
      /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`,
    ).host.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function brandColor(value: string | null | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : BRAND_FALLBACK;
}

let fontRegistered = false;
function ensureFontRegistered(
  Font: Awaited<typeof import('@react-pdf/renderer')>['Font'],
) {
  if (fontRegistered) return;
  // Noto Sans carries the Rupee sign (U+20B9), which the PDF base-14 fonts do not. On an invoice
  // a missing currency glyph is not cosmetic — it makes the amount ambiguous.
  const fontsDir = join(process.cwd(), 'assets', 'fonts');
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: join(fontsDir, 'NotoSans-Regular.ttf') },
      { src: join(fontsDir, 'NotoSans-Bold.ttf'), fontWeight: 'bold' },
    ],
  });
  // react-pdf hyphenates by default, which split "Telangana" across lines in an address. Names,
  // GSTINs and AWB numbers must never break mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

// en-IN grouping (₹1,23,456.00) is how every Indian reader parses an amount at a glance.
function money(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  // dd-MMM-yyyy — unambiguous across the dd/mm vs mm/dd divide, which matters on a document
  // that may be read by a foreign customer or a tax officer.
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

export async function renderTaxInvoice(
  invoice: Invoice,
  extras: InvoiceExtras,
  logoBuffer?: Buffer,
  branding: InvoiceBranding = {},
) {
  const { Document, Page, Text, View, Image, StyleSheet, Font } =
    await import('@react-pdf/renderer');
  ensureFontRegistered(Font);

  const brand = brandColor(branding.primaryColor);
  const displayName = branding.companyName?.trim() || invoice.supplierName;
  const supportEmail = branding.supportEmail ?? invoice.supplierEmail;
  const supportPhone = branding.supportPhone ?? invoice.supplierPhone;
  // An uploaded company logo wins; otherwise the bundled NationWide mark.
  const logoImage = logoBuffer ?? brandAsset('mark-black.png');
  const watermark = watermarkImage(logoBuffer);

  const s = StyleSheet.create({
    page: {
      paddingTop: 36,
      paddingHorizontal: 40,
      // Room for the fixed footer, so the last table row never runs under it.
      paddingBottom: 64,
      fontSize: 8.5,
      lineHeight: 1.4,
      fontFamily: 'NotoSans',
      color: INK,
    },
    // Shared with the rate card, but fainter here: an invoice is read for its figures, and the
    // mark sat right behind the line items.
    watermark: { ...WATERMARK_STYLE, opacity: 0.025 },
    accent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: brand,
    },
    masthead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: 16,
    },
    logo: { width: 44, height: 44, objectFit: 'contain', marginRight: 12 },
    logoFallback: {
      width: 44,
      height: 44,
      marginRight: 12,
      borderRadius: 8,
      backgroundColor: brand,
      color: '#ffffff',
      fontSize: 15,
      fontWeight: 'bold',
      textAlign: 'center',
      paddingTop: 11,
    },
    companyName: { fontSize: 14, fontWeight: 'bold', lineHeight: 1.2 },
    tagline: { fontSize: 8, color: MUTED, marginTop: 2 },
    website: { fontSize: 8, color: brand, marginTop: 1 },
    titleBlock: { alignItems: 'flex-end' },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      letterSpacing: 1.5,
      lineHeight: 1.2,
    },
    subtitle: { fontSize: 8, color: MUTED, marginTop: 2 },
    cancelled: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: DANGER,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      color: DANGER,
      fontWeight: 'bold',
      textAlign: 'center',
      letterSpacing: 1,
    },
    metaStrip: {
      flexDirection: 'row',
      marginTop: 18,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: PAPER,
      borderRadius: 6,
    },
    metaCell: { flex: 1, paddingRight: 8 },
    label: {
      fontSize: 6.5,
      color: MUTED,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    metaValue: { fontSize: 9, fontWeight: 'bold' },
    parties: { flexDirection: 'row', marginTop: 20, gap: 24 },
    party: { flex: 1 },
    partyName: { fontWeight: 'bold', fontSize: 9.5, marginBottom: 1 },
    muted: { color: MUTED },
    strong: { fontWeight: 'bold' },
    small: { fontSize: 7.5, color: MUTED },
    row: { flexDirection: 'row' },
    right: { textAlign: 'right' },
    table: { marginTop: 22 },
    th: {
      fontSize: 6.5,
      fontWeight: 'bold',
      color: MUTED,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    headRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: INK,
    },
    bodyRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: LINE,
    },
    td: { paddingVertical: 8, paddingHorizontal: 4 },
    // The schedule carries twelve columns on a portrait page, so it gets its own tighter cells
    // rather than squeezing the main table and hurting every other invoice.
    sth: {
      fontSize: 6,
      fontWeight: 'bold',
      color: MUTED,
      textTransform: 'uppercase',
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    std: { fontSize: 6.5, paddingVertical: 4, paddingHorizontal: 2 },
    sectionTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
    summary: { flexDirection: 'row', marginTop: 14, gap: 24 },
    words: { flex: 1, paddingTop: 4 },
    totals: { width: '44%' },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
      paddingHorizontal: 4,
    },
    grand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      // flex-end, not baseline: react-pdf ignores baseline, and the two sizes differ.
      alignItems: 'flex-end',
      marginTop: 4,
      paddingTop: 7,
      paddingHorizontal: 4,
      borderTopWidth: 1.5,
      borderTopColor: INK,
    },
    grandLabel: { fontSize: 10, fontWeight: 'bold', paddingBottom: 2 },
    grandValue: { fontSize: 14, fontWeight: 'bold' },
    notes: { flexDirection: 'row', gap: 24, marginTop: 26 },
    note: { flex: 1 },
    noteText: { fontSize: 7.5, color: MUTED, lineHeight: 1.45 },
    footer: {
      position: 'absolute',
      // Anchored from the top, not `bottom: 24`: with the page's lineHeight set, react-pdf drops a
      // bottom-anchored fixed view entirely. 800pt puts it 24pt above the foot of an A4 page.
      top: 800,
      left: 40,
      right: 40,
      borderTopWidth: 0.5,
      borderTopColor: LINE,
      paddingTop: 7,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: MUTED,
    },
  });

  const isIntraState = invoice.cgstAmount > 0 || invoice.sgstAmount > 0;

  const meta = (label: string, value: string) =>
    h(View, { key: label, style: s.metaCell }, [
      h(Text, { key: 'l', style: s.label }, label),
      h(Text, { key: 'v', style: s.metaValue }, value),
    ]);

  const totalRow = (label: string, value: string) =>
    h(View, { key: label, style: s.totalRow }, [
      h(Text, { key: 'l', style: s.muted }, label),
      h(Text, { key: 'v' }, value),
    ]);

  // Description line: the SAC, plus whatever identifies the actual shipment(s). One order can
  // produce split shipments, so every tracking number is listed rather than just the first.
  const descriptionLines = [
    // A one-off invoice has no shipment to describe, so the admin's own line replaces the
    // standard one rather than sitting underneath it.
    invoice.customLineDescription ??
      'International courier & logistics services',
    extras.destination ? `Destination: ${extras.destination}` : null,
    extras.weightKg !== null
      ? `Chargeable weight: ${extras.weightKg} kg`
      : null,
    ...extras.shipments.map(
      (sh) => `AWB ${sh.trackingNumber} (${sh.providerName})`,
    ),
  ].filter((line): line is string => line !== null);

  const consolidatedLines = extras.lines ?? [];
  const scheduleLines = extras.customLines ?? [];
  // Twelve columns on a portrait page: the widths are declared once here so the header row and
  // the body rows cannot drift apart.
  const schedW = {
    sl: { width: '4%' },
    awb: { width: '13%' },
    date: { width: '11%' },
    dest: { width: '12%' },
    net: { width: '7%' },
    svc: { width: '6%' },
    kg: { width: '8%' },
    amt: { width: '10%' },
    gmr: { width: '10%' },
    pss: { width: '6%' },
    fsc: { width: '9%' },
    tot: { flex: 1 },
  } as const;
  // Printed with the invoice details so the document says up front what period it settles —
  // without it a consolidated bill is a list of amounts with no stated scope.
  const periodLabel =
    extras.periodFrom && extras.periodTo
      ? `${formatDate(extras.periodFrom)} – ${formatDate(extras.periodTo)}`
      : null;

  // One column set for the main table, so header and rows cannot drift apart.
  const col = {
    n: { width: '6%' },
    desc: { flex: 1 },
    sac: { width: '13%' },
    amt: { width: '20%' },
  } as const;

  const itemRow = (
    key: string,
    n: string,
    lines: (string | null)[],
    amount: number,
  ) =>
    h(View, { key, style: s.bodyRow, wrap: false }, [
      h(Text, { key: 'a', style: [s.td, col.n, s.muted] }, n),
      h(
        View,
        { key: 'b', style: [s.td, col.desc] },
        lines
          .filter((line): line is string => line !== null)
          .map((line, i) =>
            h(
              Text,
              { key: String(i), style: i === 0 ? undefined : s.small },
              line,
            ),
          ),
      ),
      h(Text, { key: 'c', style: [s.td, col.sac] }, invoice.sacCode),
      h(Text, { key: 'd', style: [s.td, col.amt, s.right] }, money(amount)),
    ]);

  return h(
    Document,
    {
      title: invoice.invoiceNumber,
      author: displayName,
      subject: 'Tax invoice',
    },
    h(Page, { size: 'A4', style: s.page }, [
      // FIRST child, so everything else paints over it: react-pdf draws in document order, and a
      // watermark added last would sit on top of the figures. The fixed flag repeats it on page two
      // a long consolidated invoice rather than leaving those pages bare.
      watermark
        ? h(Image, {
            key: 'watermark',
            src: watermark,
            style: s.watermark,
            fixed: true,
          })
        : null,
      h(View, { key: 'accent', style: s.accent, fixed: true }),

      h(View, { key: 'masthead', style: s.masthead }, [
        h(View, { key: 'identity', style: s.identity }, [
          logoImage
            ? h(Image, { key: 'logo', src: logoImage, style: s.logo })
            : h(Text, { key: 'fallback', style: s.logoFallback }, 'NW'),
          h(View, { key: 'brand-copy', style: { flex: 1 } }, [
            h(Text, { key: 'company', style: s.companyName }, displayName),
            branding.tagline
              ? h(Text, { key: 'tagline', style: s.tagline }, branding.tagline)
              : null,
            branding.website
              ? h(
                  Text,
                  { key: 'website', style: s.website },
                  websiteHost(branding.website),
                )
              : null,
          ]),
        ]),
        h(View, { key: 'title-block', style: s.titleBlock }, [
          h(Text, { key: 't', style: s.title }, 'TAX INVOICE'),
          h(
            Text,
            { key: 'st', style: s.subtitle },
            isIntraState
              ? 'Intra-state supply · CGST + SGST'
              : 'Inter-state supply · IGST',
          ),
        ]),
      ]),

      invoice.status === 'CANCELLED'
        ? h(
            Text,
            { key: 'x', style: s.cancelled },
            `CANCELLED${invoice.cancellationReason ? ` · ${invoice.cancellationReason}` : ''}`,
          )
        : null,

      // --- Invoice details ---
      h(View, { key: 'meta', style: s.metaStrip }, [
        meta('Invoice no.', invoice.invoiceNumber),
        meta('Invoice date', formatDate(invoice.invoiceDate)),
        periodLabel ? meta('Billing period', periodLabel) : null,
        meta(
          'Place of supply',
          `${invoice.placeOfSupplyState} (${invoice.placeOfSupplyCode})`,
        ),
        meta('SAC', invoice.sacCode),
      ]),

      // --- Supplier, recipient, supply ---
      h(View, { key: 'parties', style: s.parties }, [
        h(View, { key: 'sup', style: s.party }, [
          h(Text, { key: 'label', style: s.label }, 'From'),
          h(Text, { key: 'n', style: s.partyName }, invoice.supplierName),
          h(Text, { key: 'a', style: s.muted }, invoice.supplierAddress),
          h(Text, { key: 'g' }, `GSTIN ${invoice.supplierGstin}`),
          h(
            Text,
            { key: 's', style: s.muted },
            `State: ${invoice.supplierStateName} (${invoice.supplierStateCode})`,
          ),
          invoice.supplierEmail
            ? h(Text, { key: 'e', style: s.muted }, invoice.supplierEmail)
            : null,
          invoice.supplierPhone
            ? h(Text, { key: 'p', style: s.muted }, invoice.supplierPhone)
            : null,
        ]),
        h(View, { key: 'bill', style: s.party }, [
          h(Text, { key: 'label', style: s.label }, 'Billed to'),
          h(Text, { key: 'n', style: s.partyName }, invoice.recipientName),
          invoice.recipientAddress
            ? h(Text, { key: 'a', style: s.muted }, invoice.recipientAddress)
            : null,
          h(Text, { key: 'p', style: s.muted }, invoice.recipientPhone),
          h(
            Text,
            { key: 'g' },
            // Spelled out rather than left blank: "Unregistered" is a meaningful statement on a
            // GST invoice, an empty line is just an omission.
            `GSTIN ${invoice.recipientGstin ?? 'Unregistered (B2C)'}`,
          ),
        ]),
        h(View, { key: 'rc', style: s.party }, [
          h(Text, { key: 'label', style: s.label }, 'Supply details'),
          h(Text, { key: 'r' }, 'Reverse charge: No'),
          h(Text, { key: 'c' }, `Currency: ${invoice.currency}`),
          extras.destination
            ? h(
                Text,
                { key: 'd', style: s.muted },
                `Destination: ${extras.destination}`,
              )
            : null,
          extras.shipments.length
            ? h(
                Text,
                { key: 'awb', style: s.muted },
                `${extras.shipments.length} shipment${extras.shipments.length === 1 ? '' : 's'} included`,
              )
            : null,
        ]),
      ]),

      // --- Line items ---
      h(View, { key: 'tbl', style: s.table }, [
        h(View, { key: 'head', style: s.headRow, fixed: true }, [
          h(Text, { key: 'a', style: [s.th, col.n] }, '#'),
          h(
            Text,
            { key: 'b', style: [s.th, col.desc] },
            'Description of service',
          ),
          h(Text, { key: 'c', style: [s.th, col.sac] }, 'SAC'),
          h(
            Text,
            { key: 'd', style: [s.th, col.amt, s.right] },
            'Taxable value',
          ),
        ]),
        // A consolidated invoice prints one row per order it bills; every other kind prints the
        // single derived line it always did. Same table either way — a customer reading two of
        // our invoices side by side should not be reading two different documents.
        ...(scheduleLines.length > 0
          ? [
              itemRow(
                'sched-line',
                '1',
                [
                  descriptionLines[0],
                  'Itemised in the shipment schedule below.',
                ],
                invoice.taxableValue,
              ),
            ]
          : consolidatedLines.length > 0
            ? consolidatedLines.map((line, i) =>
                itemRow(
                  `body-${i}`,
                  String(i + 1),
                  [line.description, `Supplied ${formatDate(line.supplyDate)}`],
                  line.amount,
                ),
              )
            : [itemRow('body', '1', descriptionLines, invoice.taxableValue)]),
      ]),

      // --- Shipment schedule (custom invoices billed from a freight list) ---
      scheduleLines.length > 0
        ? h(View, { key: 'sched', style: { marginTop: 18 } }, [
            h(Text, { key: 'h', style: s.sectionTitle }, 'Shipment schedule'),
            h(View, { key: 'head', style: s.headRow }, [
              h(Text, { key: 'n', style: [s.sth, schedW.sl] }, '#'),
              h(Text, { key: 'a', style: [s.sth, schedW.awb] }, 'AWB No.'),
              h(Text, { key: 'd', style: [s.sth, schedW.date] }, 'Date'),
              h(Text, { key: 'x', style: [s.sth, schedW.dest] }, 'Destination'),
              h(Text, { key: 'w', style: [s.sth, schedW.net] }, 'Network'),
              h(Text, { key: 'v', style: [s.sth, schedW.svc] }, 'D/S'),
              h(
                Text,
                { key: 'k', style: [s.sth, s.right, schedW.kg] },
                'Wt (kg)',
              ),
              h(
                Text,
                { key: 'm', style: [s.sth, s.right, schedW.amt] },
                'Amount',
              ),
              h(
                Text,
                { key: 'g', style: [s.sth, s.right, schedW.gmr] },
                'GMR/Comm',
              ),
              h(Text, { key: 'p', style: [s.sth, s.right, schedW.pss] }, 'PSS'),
              h(Text, { key: 'f', style: [s.sth, s.right, schedW.fsc] }, 'FSC'),
              h(
                Text,
                { key: 't', style: [s.sth, s.right, schedW.tot] },
                'Total',
              ),
            ]),
            ...scheduleLines.map((line, i) =>
              h(
                View,
                { key: 'sched-row-' + i, style: s.bodyRow, wrap: false },
                [
                  h(
                    Text,
                    { key: 'n', style: [s.std, schedW.sl, s.muted] },
                    String(i + 1),
                  ),
                  h(
                    Text,
                    { key: 'a', style: [s.std, schedW.awb] },
                    line.awbNumber ?? '—',
                  ),
                  h(
                    Text,
                    { key: 'd', style: [s.std, schedW.date] },
                    line.supplyDate
                      ? formatDate(new Date(line.supplyDate))
                      : '—',
                  ),
                  h(
                    Text,
                    { key: 'x', style: [s.std, schedW.dest] },
                    line.destination ?? '—',
                  ),
                  h(
                    Text,
                    { key: 'w', style: [s.std, schedW.net] },
                    line.network ?? '—',
                  ),
                  h(
                    Text,
                    { key: 'v', style: [s.std, schedW.svc] },
                    line.service ?? '—',
                  ),
                  h(
                    Text,
                    { key: 'k', style: [s.std, s.right, schedW.kg] },
                    line.weightKg === null || line.weightKg === undefined
                      ? '—'
                      : line.weightKg.toFixed(2),
                  ),
                  h(
                    Text,
                    { key: 'm', style: [s.std, s.right, schedW.amt] },
                    money(line.amount),
                  ),
                  h(
                    Text,
                    { key: 'g', style: [s.std, s.right, schedW.gmr] },
                    money(line.otherCharges ?? 0),
                  ),
                  h(
                    Text,
                    { key: 'p', style: [s.std, s.right, schedW.pss] },
                    money(line.pss ?? 0),
                  ),
                  h(
                    Text,
                    { key: 'f', style: [s.std, s.right, schedW.fsc] },
                    money(line.fsc ?? 0),
                  ),
                  h(
                    Text,
                    { key: 't', style: [s.std, s.right, schedW.tot, s.strong] },
                    money(customInvoiceLineTotal(line)),
                  ),
                ],
              ),
            ),
            // The schedule is tax-inclusive, like every figure staff type into the form. Said
            // out loud so nobody reconciles these rows against the taxable value above, finds a
            // gap, and assumes the invoice is wrong.
            h(
              Text,
              { key: 'note', style: [s.small, { marginTop: 4 }] },
              'Schedule amounts include GST. The taxable value and tax shown above are derived from this total.',
            ),
          ])
        : null,

      // --- Amount in words + totals, kept together so a total never starts a page alone ---
      h(View, { key: 'summary', style: s.summary, wrap: false }, [
        h(View, { key: 'words', style: s.words }, [
          invoice.currency === 'INR'
            ? h(View, { key: 'w' }, [
                h(Text, { key: 'l', style: s.label }, 'Amount in words'),
                h(
                  Text,
                  { key: 'v', style: s.strong },
                  rupeesInWords(invoice.totalAmount),
                ),
              ])
            : null,
        ]),
        h(View, { key: 'totals', style: s.totals }, [
          totalRow('Taxable value', money(invoice.taxableValue)),
          ...(isIntraState
            ? [
                totalRow(
                  `CGST @ ${invoice.cgstRate}%`,
                  money(invoice.cgstAmount),
                ),
                totalRow(
                  `SGST @ ${invoice.sgstRate}%`,
                  money(invoice.sgstAmount),
                ),
              ]
            : [
                totalRow(
                  `IGST @ ${invoice.igstRate}%`,
                  money(invoice.igstAmount),
                ),
              ]),
          invoice.nonTaxableCharges > 0
            ? totalRow(
                'Other charges (not taxable)',
                money(invoice.nonTaxableCharges),
              )
            : null,
          // Below the tax lines on purpose: this is a deduction from the payable total, not a
          // reduction of the taxable value, so the tax above still reconciles to the supply.
          invoice.discountAmount > 0
            ? totalRow(
                invoice.discountCode
                  ? `Less: discount (${invoice.discountCode})`
                  : 'Less: discount',
                `-${money(invoice.discountAmount)}`,
              )
            : null,
          h(View, { key: 'g', style: s.grand }, [
            h(Text, { key: 'l', style: s.grandLabel }, 'Total'),
            h(
              Text,
              { key: 'v', style: s.grandValue },
              money(invoice.totalAmount),
            ),
          ]),
        ]),
      ]),

      branding.termsAndConditions ||
      branding.footerNotes ||
      branding.legalDisclaimer
        ? h(View, { key: 'notes', style: s.notes, wrap: false }, [
            branding.termsAndConditions
              ? h(View, { key: 'terms', style: s.note }, [
                  h(Text, { key: 'h', style: s.label }, 'Terms & conditions'),
                  ...termLines(branding.termsAndConditions).map((term, i) =>
                    h(
                      Text,
                      { key: `t${i}`, style: s.noteText },
                      `${i + 1}. ${term}`,
                    ),
                  ),
                ])
              : null,
            branding.footerNotes || branding.legalDisclaimer
              ? h(View, { key: 'notes', style: s.note }, [
                  h(Text, { key: 'h', style: s.label }, 'Notes'),
                  h(
                    Text,
                    { key: 'v', style: s.noteText },
                    branding.footerNotes ?? branding.legalDisclaimer,
                  ),
                ])
              : null,
          ])
        : null,

      // --- Footer, on every page ---
      h(View, { key: 'foot', style: s.footer, fixed: true }, [
        h(
          Text,
          { key: 'a' },
          'Computer-generated invoice. No signature required.',
        ),
        h(
          Text,
          { key: 'b' },
          [supportEmail, supportPhone].filter(Boolean).join(' · ') ||
            `FY ${invoice.financialYear}`,
        ),
        h(Text, {
          key: 'c',
          render: ({
            pageNumber,
            totalPages,
          }: {
            pageNumber: number;
            totalPages: number;
          }) =>
            `${invoice.invoiceNumber} · Page ${pageNumber} of ${totalPages}`,
        }),
      ]),
    ]),
  );
}
