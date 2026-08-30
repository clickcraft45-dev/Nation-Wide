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
) {
  const { Document, Page, Text, View, Image, StyleSheet, Font } =
    await import('@react-pdf/renderer');
  ensureFontRegistered(Font);

  const s = StyleSheet.create({
    page: {
      padding: 32,
      fontSize: 9,
      fontFamily: 'NotoSans',
      color: '#1f2937',
    },
    title: {
      fontSize: 15,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 2,
    },
    subtitle: {
      fontSize: 8,
      textAlign: 'center',
      color: '#6b7280',
      marginBottom: 10,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    logo: { width: 54, height: 54, objectFit: 'contain' },
    box: {
      borderWidth: 1,
      borderColor: '#d1d5db',
      padding: 8,
      marginBottom: 8,
    },
    twoCol: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    col: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', padding: 8 },
    label: { fontSize: 7.5, color: '#6b7280', marginBottom: 1 },
    strong: { fontWeight: 'bold' },
    h: { fontSize: 9, fontWeight: 'bold', marginBottom: 3 },
    row: { flexDirection: 'row' },
    th: {
      backgroundColor: '#f3f4f6',
      fontWeight: 'bold',
      padding: 5,
      borderWidth: 1,
      borderColor: '#d1d5db',
    },
    td: { padding: 5, borderWidth: 1, borderColor: '#d1d5db' },
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
      paddingVertical: 2.5,
      paddingHorizontal: 6,
    },
    grand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 5,
      paddingHorizontal: 6,
      backgroundColor: '#f3f4f6',
      borderWidth: 1,
      borderColor: '#d1d5db',
      fontWeight: 'bold',
      fontSize: 10.5,
    },
    foot: { marginTop: 14, fontSize: 7.5, color: '#6b7280' },
    cancelled: {
      color: '#b91c1c',
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 6,
    },
  });

  const isIntraState = invoice.cgstAmount > 0 || invoice.sgstAmount > 0;

  const field = (label: string, value: string | null | undefined) =>
    h(View, { key: label }, [
      h(Text, { key: 'l', style: s.label }, label),
      h(Text, { key: 'v' }, value ?? '—'),
    ]);

  const totalRow = (label: string, value: string) =>
    h(View, { key: label, style: s.totalRow }, [
      h(Text, { key: 'l' }, label),
      h(Text, { key: 'v' }, value),
    ]);

  // Description line: the SAC, plus whatever identifies the actual shipment(s). One order can
  // produce split shipments, so every tracking number is listed rather than just the first.
  const descriptionLines = [
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
      h(Text, { key: 't', style: s.title }, 'TAX INVOICE'),
      h(
        Text,
        { key: 'st', style: s.subtitle },
        isIntraState
          ? 'Intra-state supply — CGST + SGST'
          : 'Inter-state supply — IGST',
      ),

      invoice.status === 'CANCELLED'
        ? h(
            Text,
            { key: 'x', style: s.cancelled },
            `CANCELLED${invoice.cancellationReason ? ` — ${invoice.cancellationReason}` : ''}`,
          )
        : null,

      // --- Supplier + invoice meta ---
      h(View, { key: 'hdr', style: s.headerRow }, [
        h(View, { key: 'sup', style: { flex: 1 } }, [
          logoBuffer
            ? h(Image, { key: 'logo', src: logoBuffer, style: s.logo })
            : null,
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
        ]),
        h(View, { key: 'meta', style: { width: '38%' } }, [
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
          h(Text, { key: 'h', style: s.h }, 'Details'),
          h(Text, { key: 'r' }, 'Reverse charge applicable: No'),
          h(Text, { key: 'c' }, `Currency: ${invoice.currency}`),
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

      h(View, { key: 'foot', style: s.foot }, [
        h(
          Text,
          { key: 'a' },
          'This is a computer-generated invoice and does not require a physical signature.',
        ),
        h(
          Text,
          { key: 'b' },
          `Issued ${formatDate(invoice.invoiceDate)} · FY ${invoice.financialYear} · Ref ${invoice.breakdownSource}`,
        ),
      ]),
    ]),
  );
}
