import { createElement as h } from 'react';
import type { Receipt } from '@prisma/client';
import { brandAsset } from '../../rate-cards/brand-assets';

// Plain React.createElement and a dynamic ESM import of @react-pdf/renderer at the service
// layer — the same constraint tax-invoice-template.ts documents, followed here rather than
// inventing a second pattern.

/**
 * The non-statutory part of a receipt's identity, frozen into the rendered file at issue time
 * exactly as the invoice template freezes its own.
 */
export interface ReceiptBranding {
  companyName?: string | null;
  tagline?: string | null;
  primaryColor?: string | null;
  logoPath?: string | null;
  website?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  footerNotes?: string | null;
}

export interface ReceiptExtras {
  /** The invoice this settles, printed so the two documents can be filed against each other. */
  invoiceNumber: string | null;
  /** AWBs covered, when the payment was for shipments the customer knows by number. */
  trackingNumbers: string[];
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  RAZORPAY: 'Online payment',
};

function money(value: number, currency: string): string {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${value.toFixed(2)}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Amount in words, which Indian payment documents are expected to carry: a figure alone can be
 * altered by a stroke of a pen, and the words are what a dispute falls back on.
 *
 * Indian grouping (crore/lakh/thousand), not the western short scale — "twelve lakh" is what a
 * reader here expects, and "1.2 million" would look like a foreign document.
 */
export function amountInWords(value: number): string {
  const ones = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ];
  const tens = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety',
  ];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    const t = tens[Math.floor(n / 10)];
    const o = n % 10;
    return o === 0 ? t : `${t}-${ones[o]}`;
  };

  const threeDigits = (n: number): string => {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    if (hundreds === 0) return twoDigits(rest);
    if (rest === 0) return `${ones[hundreds]} hundred`;
    return `${ones[hundreds]} hundred ${twoDigits(rest)}`;
  };

  // Split at the paisa boundary before anything else: rupees and paise are named separately on
  // the document, and rounding the whole figure first would lose the paise entirely.
  const rounded = Math.round(value * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const say = (n: number): string => {
    if (n === 0) return 'zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${threeDigits(crore)} crore`);
    if (lakh) parts.push(`${threeDigits(lakh)} lakh`);
    if (thousand) parts.push(`${threeDigits(thousand)} thousand`);
    if (rest) parts.push(threeDigits(rest));
    return parts.join(' ');
  };

  const words = `${say(rupees)} rupees`;
  const full = paise > 0 ? `${words} and ${say(paise)} paise` : words;
  return `${full.charAt(0).toUpperCase()}${full.slice(1)} only`;
}

export async function renderReceipt(
  receipt: Receipt,
  extras: ReceiptExtras,
  logoBuffer: Buffer | undefined,
  branding: ReceiptBranding,
) {
  const { Document, Page, Text, View, Image, StyleSheet } =
    await import('@react-pdf/renderer');

  const brand = branding.primaryColor?.trim() || '#0b0b0c';
  const displayName = branding.companyName?.trim() || receipt.supplierName;
  // An uploaded company logo wins; otherwise the bundled NationWide mark.
  const logoImage = logoBuffer ?? brandAsset('mark-black.png');

  const s = StyleSheet.create({
    page: {
      paddingTop: 38,
      paddingHorizontal: 40,
      paddingBottom: 46,
      fontSize: 9.5,
      color: '#18181b',
      fontFamily: 'Helvetica',
    },
    topRule: { height: 3, backgroundColor: brand, marginBottom: 18 },
    masthead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 22,
    },
    identity: { flexDirection: 'row', alignItems: 'center' },
    logoFrame: {
      width: 42,
      height: 42,
      marginRight: 10,
      borderWidth: 1,
      borderColor: '#e4e4e7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: { width: 34, height: 34, objectFit: 'contain' },
    logoFallback: {
      color: '#ffffff',
      fontSize: 15,
      fontFamily: 'Helvetica-Bold',
    },
    companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
    tagline: { fontSize: 8, color: '#6b6b72', marginTop: 2 },
    website: { fontSize: 8, color: '#6b6b72' },
    title: { fontSize: 17, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
    titleNote: {
      fontSize: 8,
      color: '#6b6b72',
      textAlign: 'right',
      marginTop: 3,
    },

    meta: { marginTop: 10, alignItems: 'flex-end' },
    metaRow: { flexDirection: 'row', marginBottom: 2 },
    label: { color: '#6b6b72', marginRight: 6 },
    strong: { fontFamily: 'Helvetica-Bold' },

    parties: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#e4e4e7',
      paddingVertical: 12,
      marginBottom: 20,
    },
    col: { flex: 1, paddingRight: 14 },
    h: {
      fontSize: 8,
      color: '#6b6b72',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 4,
    },

    // The amount is the whole point of the document, so it is the largest thing on the page.
    amountPanel: {
      borderWidth: 1,
      borderColor: '#e4e4e7',
      padding: 16,
      marginBottom: 18,
    },
    amount: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: brand },
    words: { fontSize: 9, color: '#3f3f46', marginTop: 6 },

    detailRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderColor: '#f4f4f5',
      paddingVertical: 6,
    },
    detailLabel: { width: '34%', color: '#6b6b72' },
    detailValue: { flex: 1 },

    stamp: {
      marginTop: 22,
      alignSelf: 'flex-start',
      borderWidth: 2,
      borderColor: '#15803d',
      color: '#15803d',
      paddingVertical: 5,
      paddingHorizontal: 12,
      fontSize: 12,
      fontFamily: 'Helvetica-Bold',
      letterSpacing: 1.5,
    },

    footer: {
      position: 'absolute',
      left: 40,
      right: 40,
      bottom: 24,
      borderTopWidth: 1,
      borderColor: '#e4e4e7',
      paddingTop: 8,
      fontSize: 7.5,
      color: '#6b6b72',
    },
  });

  const metaRow = (label: string, value: string) =>
    h(View, { key: label, style: s.metaRow }, [
      h(Text, { key: 'l', style: s.label }, label),
      h(Text, { key: 'v', style: s.strong }, value),
    ]);

  const detail = (label: string, value: string) =>
    h(View, { key: label, style: s.detailRow }, [
      h(Text, { key: 'l', style: s.detailLabel }, label),
      h(Text, { key: 'v', style: s.detailValue }, value),
    ]);

  return h(
    Document,
    { title: receipt.receiptNumber },
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
                !logoImage
                  ? { backgroundColor: brand, borderColor: brand }
                  : undefined,
              ],
            },
            logoImage
              ? h(Image, { key: 'logo', src: logoImage, style: s.logo })
              : h(Text, { key: 'fallback', style: s.logoFallback }, 'NW'),
          ),
          h(View, { key: 'copy' }, [
            h(Text, { key: 'c', style: s.companyName }, displayName),
            branding.tagline
              ? h(Text, { key: 't', style: s.tagline }, branding.tagline)
              : null,
            branding.website
              ? h(Text, { key: 'w', style: s.website }, branding.website)
              : null,
          ]),
        ]),
        h(View, { key: 'title' }, [
          h(Text, { key: 't', style: s.title }, 'PAYMENT RECEIPT'),
          // Says outright what this document is not. A receipt is routinely mistaken for a tax
          // invoice, and only one of the two can be claimed against.
          h(
            Text,
            { key: 'n', style: s.titleNote },
            'Acknowledgement of payment received',
          ),
          h(View, { key: 'meta', style: s.meta }, [
            metaRow('Receipt No.', receipt.receiptNumber),
            metaRow('Date', formatDate(receipt.receivedAt)),
            extras.invoiceNumber
              ? metaRow('Against invoice', extras.invoiceNumber)
              : null,
          ]),
        ]),
      ]),

      h(View, { key: 'parties', style: s.parties }, [
        h(View, { key: 'from', style: s.col }, [
          h(Text, { key: 'h', style: s.h }, 'Received by'),
          h(Text, { key: 'n', style: s.strong }, receipt.supplierName),
          h(Text, { key: 'a' }, receipt.supplierAddress),
          receipt.supplierGstin
            ? h(Text, { key: 'g' }, `GSTIN: ${receipt.supplierGstin}`)
            : null,
        ]),
        h(View, { key: 'to', style: s.col }, [
          h(Text, { key: 'h', style: s.h }, 'Received from'),
          h(Text, { key: 'n', style: s.strong }, receipt.recipientName),
          h(Text, { key: 'p' }, receipt.recipientPhone),
        ]),
      ]),

      h(View, { key: 'amount', style: s.amountPanel }, [
        h(Text, { key: 'h', style: s.h }, 'Amount received'),
        h(
          Text,
          { key: 'a', style: s.amount },
          money(receipt.amount, receipt.currency),
        ),
        h(Text, { key: 'w', style: s.words }, amountInWords(receipt.amount)),
      ]),

      h(View, { key: 'details' }, [
        detail(
          'Payment method',
          METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod,
        ),
        detail('Received on', formatDate(receipt.receivedAt)),
        extras.invoiceNumber
          ? detail('Settles invoice', extras.invoiceNumber)
          : null,
        extras.trackingNumbers.length > 0
          ? detail(
              extras.trackingNumbers.length === 1 ? 'Shipment' : 'Shipments',
              extras.trackingNumbers.join(', '),
            )
          : null,
      ]),

      h(Text, { key: 'stamp', style: s.stamp }, 'PAYMENT RECEIVED'),

      h(View, { key: 'footer', style: s.footer }, [
        h(
          Text,
          { key: 'a' },
          // A computer-generated document with no signature has to say so, or its lack of one
          // reads as an omission.
          'This is a computer-generated receipt and does not require a signature.',
        ),
        branding.footerNotes
          ? h(Text, { key: 'n' }, branding.footerNotes)
          : null,
        h(
          Text,
          { key: 'c' },
          [branding.supportEmail, branding.supportPhone]
            .filter(Boolean)
            .join('  ·  '),
        ),
      ]),
    ]),
  );
}
