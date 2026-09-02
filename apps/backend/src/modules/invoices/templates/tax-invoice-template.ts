import { createElement as h } from 'react';
import { join } from 'node:path';
import type { Invoice } from '@prisma/client';

// Plain React.createElement, not JSX, and a dynamic ESM import of @react-pdf/renderer — both for
// exactly the reasons spelled out at the top of rate-cards/templates/classic-template.ts. This
// file follows that established pattern rather than inventing a second one.

export interface InvoiceExtras {
  shipments: { trackingNumber: string; providerName: string }[];
  destination: string | null;
  weightKg: number | null;
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
const MUTED = '#667085';
const PAPER = '#f7f7f8';
const LINE = '#dde1e6';
const BRAND_FALLBACK = '#7f1020';

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
  fontRegistered = true;
}

function money(value: number): string {
  return `₹${value.toFixed(2)}`;
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

  const s = StyleSheet.create({
    page: {
      padding: 32,
      fontSize: 9,
      fontFamily: 'NotoSans',
      color: INK,
    },
    topRule: {
      height: 5,
      backgroundColor: brand,
      marginHorizontal: -32,
      marginTop: -32,
      marginBottom: 22,
    },
    masthead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: 12,
    },
    logoFrame: {
      width: 52,
      height: 52,
      borderWidth: 1,
      borderColor: LINE,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      backgroundColor: '#ffffff',
    },
    title: {
      fontSize: 19,
      fontWeight: 'bold',
      textAlign: 'right',
      letterSpacing: 0.5,
    },
    subtitle: {
      fontSize: 8.5,
      textAlign: 'right',
      color: MUTED,
      marginTop: 3,
    },
    companyName: { fontSize: 15, fontWeight: 'bold', color: INK },
    tagline: { fontSize: 8, color: MUTED, marginTop: 2 },
    website: { fontSize: 7.5, color: brand, marginTop: 4 },
    supplierRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    logo: { width: 42, height: 42, objectFit: 'contain' },
    logoFallback: { fontSize: 15, color: '#ffffff', fontWeight: 'bold' },
    box: {
      borderWidth: 1,
      borderColor: LINE,
      padding: 9,
      marginBottom: 8,
    },
    invoiceMeta: {
      width: '38%',
      borderWidth: 1,
      borderColor: LINE,
      borderTopWidth: 3,
      borderTopColor: brand,
      borderRadius: 7,
      padding: 9,
      backgroundColor: PAPER,
    },
    twoCol: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    col: {
      flex: 1,
      borderWidth: 1,
      borderColor: LINE,
      borderRadius: 7,
      padding: 10,
      backgroundColor: '#ffffff',
    },
    label: {
      fontSize: 7.5,
      color: MUTED,
      marginBottom: 2,
      textTransform: 'uppercase',
    },
    strong: { fontWeight: 'bold' },
    h: { fontSize: 9, fontWeight: 'bold', marginBottom: 4, color: INK },
    small: { fontSize: 8, color: MUTED, marginTop: 3 },
    row: { flexDirection: 'row' },
    th: {
      backgroundColor: INK,
      color: '#ffffff',
      fontWeight: 'bold',
      padding: 6,
      borderWidth: 1,
      borderColor: INK,
    },
    td: { padding: 6, borderWidth: 1, borderColor: LINE },
    right: { textAlign: 'right' },
    totalsWrap: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 6,
    },
    totals: { width: '55%' },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
      paddingHorizontal: 6,
    },
    grand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 7,
      paddingHorizontal: 8,
      backgroundColor: INK,
      color: '#ffffff',
      borderRadius: 6,
      fontWeight: 'bold',
      fontSize: 11,
    },
    notes: { flexDirection: 'row', gap: 10, marginTop: 16 },
    note: { flex: 1, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 7 },
    foot: { marginTop: 12, fontSize: 7.5, color: MUTED, lineHeight: 1.35 },
    footerBar: {
      marginTop: 12,
      borderTopWidth: 1,
      borderTopColor: LINE,
      paddingTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    cancelled: {
      color: '#b91c1c',
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 10,
    },
  });

  const isIntraState = invoice.cgstAmount > 0 || invoice.sgstAmount > 0;

  const field = (label: string, value: string | null | undefined) =>
    h(View, { key: label, style: { marginBottom: 5 } }, [
      h(Text, { key: 'l', style: s.label }, label),
      h(Text, { key: 'v', style: s.strong }, value ?? '—'),
    ]);

  const totalRow = (label: string, value: string) =>
    h(View, { key: label, style: s.totalRow }, [
      h(Text, { key: 'l' }, label),
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

  return h(
    Document,
    { title: invoice.invoiceNumber },
    h(Page, { size: 'A4', style: s.page }, [
      h(View, { key: 'rule', style: s.topRule }),
      h(View, { key: 'masthead', style: s.masthead }, [
        h(View, { key: 'identity', style: s.identity }, [
          h(
            View,
            {
              key: 'logo-frame',
              style: [
                s.logoFrame,
                !logoBuffer
                  ? { backgroundColor: brand, borderColor: brand }
                  : undefined,
              ],
            },
            logoBuffer
              ? h(Image, { key: 'logo', src: logoBuffer, style: s.logo })
              : h(Text, { key: 'fallback', style: s.logoFallback }, 'NW'),
          ),
          h(View, { key: 'brand-copy' }, [
            h(Text, { key: 'company', style: s.companyName }, displayName),
            branding.tagline
              ? h(Text, { key: 'tagline', style: s.tagline }, branding.tagline)
              : null,
            branding.website
              ? h(Text, { key: 'website', style: s.website }, branding.website)
              : null,
          ]),
        ]),
        h(View, { key: 'title-block' }, [
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
            `CANCELLED${invoice.cancellationReason ? ` — ${invoice.cancellationReason}` : ''}`,
          )
        : null,

      // --- Supplier + invoice meta ---
      h(View, { key: 'hdr', style: s.supplierRow }, [
        h(
          View,
          {
            key: 'sup',
            style: [
              s.box,
              { flex: 1, marginRight: 10, marginBottom: 0, borderRadius: 7 },
            ],
          },
          [
            h(
              Text,
              { key: 'label', style: s.label },
              'Supplier / registered business',
            ),
            h(Text, { key: 'n', style: s.strong }, invoice.supplierName),
            h(Text, { key: 'a' }, invoice.supplierAddress),
            h(Text, { key: 'g' }, `GSTIN: ${invoice.supplierGstin}`),
            h(
              Text,
              { key: 's' },
              `State: ${invoice.supplierStateName} (${invoice.supplierStateCode})`,
            ),
            invoice.supplierEmail
              ? h(Text, { key: 'e' }, invoice.supplierEmail)
              : null,
            invoice.supplierPhone
              ? h(Text, { key: 'p' }, invoice.supplierPhone)
              : null,
          ],
        ),
        h(View, { key: 'meta', style: s.invoiceMeta }, [
          field('Invoice No.', invoice.invoiceNumber),
          field('Invoice Date', formatDate(invoice.invoiceDate)),
          field(
            'Place of Supply',
            `${invoice.placeOfSupplyState} (${invoice.placeOfSupplyCode})`,
          ),
          field('SAC', invoice.sacCode),
        ]),
      ]),

      // --- Recipient ---
      h(View, { key: 'party', style: s.twoCol }, [
        h(View, { key: 'bill', style: s.col }, [
          h(Text, { key: 'h', style: s.h }, 'Billed to'),
          h(Text, { key: 'n', style: s.strong }, invoice.recipientName),
          invoice.recipientAddress
            ? h(Text, { key: 'a' }, invoice.recipientAddress)
            : null,
          h(Text, { key: 'p' }, invoice.recipientPhone),
          h(
            Text,
            { key: 'g' },
            // Spelled out rather than left blank: "Unregistered" is a meaningful statement on a
            // GST invoice, an empty line is just an omission.
            `GSTIN: ${invoice.recipientGstin ?? 'Unregistered (B2C)'}`,
          ),
        ]),
        h(View, { key: 'rc', style: s.col }, [
          h(Text, { key: 'h', style: s.h }, 'Supply details'),
          h(Text, { key: 'r' }, 'Reverse charge applicable: No'),
          h(Text, { key: 'c' }, `Currency: ${invoice.currency}`),
          extras.destination
            ? h(
                Text,
                { key: 'd', style: s.small },
                `Destination: ${extras.destination}`,
              )
            : null,
          extras.shipments.length
            ? h(
                Text,
                { key: 'awb', style: s.small },
                `${extras.shipments.length} shipment${extras.shipments.length === 1 ? '' : 's'} included`,
              )
            : null,
        ]),
      ]),

      // --- Line item ---
      h(View, { key: 'tbl' }, [
        h(View, { key: 'head', style: s.row }, [
          h(Text, { key: 'a', style: [s.th, { width: '8%' }] }, '#'),
          h(
            Text,
            { key: 'b', style: [s.th, { flex: 1 }] },
            'Description of service',
          ),
          h(Text, { key: 'c', style: [s.th, { width: '14%' }] }, 'SAC'),
          h(
            Text,
            { key: 'd', style: [s.th, s.right, { width: '22%' }] },
            'Taxable value',
          ),
        ]),
        h(View, { key: 'body', style: s.row }, [
          h(Text, { key: 'a', style: [s.td, { width: '8%' }] }, '1'),
          h(
            View,
            { key: 'b', style: [s.td, { flex: 1 }] },
            descriptionLines.map((line, i) =>
              h(Text, { key: String(i) }, line),
            ),
          ),
          h(
            Text,
            { key: 'c', style: [s.td, { width: '14%' }] },
            invoice.sacCode,
          ),
          h(
            Text,
            { key: 'd', style: [s.td, s.right, { width: '22%' }] },
            money(invoice.taxableValue),
          ),
        ]),
      ]),

      // --- Totals ---
      h(View, { key: 'tot', style: s.totalsWrap }, [
        h(View, { key: 'inner', style: s.totals }, [
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
          h(View, { key: 'g', style: s.grand }, [
            h(Text, { key: 'l' }, 'Total'),
            h(Text, { key: 'v' }, money(invoice.totalAmount)),
          ]),
        ]),
      ]),

      branding.termsAndConditions ||
      branding.footerNotes ||
      branding.legalDisclaimer
        ? h(View, { key: 'notes', style: s.notes }, [
            branding.termsAndConditions
              ? h(View, { key: 'terms', style: s.note }, [
                  h(Text, { key: 'h', style: s.label }, 'Terms'),
                  h(
                    Text,
                    { key: 'v', style: s.foot },
                    branding.termsAndConditions,
                  ),
                ])
              : null,
            branding.footerNotes || branding.legalDisclaimer
              ? h(View, { key: 'notes', style: s.note }, [
                  h(Text, { key: 'h', style: s.label }, 'Notes'),
                  h(
                    Text,
                    { key: 'v', style: s.foot },
                    branding.footerNotes ?? branding.legalDisclaimer,
                  ),
                ])
              : null,
          ])
        : null,

      h(View, { key: 'foot', style: s.foot }, [
        h(
          Text,
          { key: 'a' },
          'This is a computer-generated invoice and does not require a physical signature.',
        ),
        h(View, { key: 'bar', style: s.footerBar }, [
          h(
            Text,
            { key: 'b' },
            `Issued ${formatDate(invoice.invoiceDate)} · FY ${invoice.financialYear}`,
          ),
          h(
            Text,
            { key: 'c' },
            [supportEmail, supportPhone].filter(Boolean).join(' · ') ||
              'Customer support',
          ),
        ]),
      ]),
    ]),
  );
}
