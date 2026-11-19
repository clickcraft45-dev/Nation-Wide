import { createElement as h, type ReactElement } from 'react';
import {
  customsInvoiceDefaultDeclaration,
  customsInvoiceTotal,
  CUSTOMS_INVOICE_DEFAULT_TERMS,
  type CustomsInvoiceDto,
} from '@nationwide/shared-types';
import { ensureFontRegistered } from './tax-invoice-template';

// Plain createElement and a dynamic import of @react-pdf/renderer, for the reasons at the top of
// rate-cards/templates/classic-template.ts.
//
// The layout copies the spreadsheet invoice the office already sends with personal shipments:
// one bordered grid, consignor and consignee down the left, the box list and countries down the
// right, the goods table grouped by box, and the customs declaration with a signature box.

const INK = '#000000';
const RULE = 0.75;

const lines = (text?: string | null) =>
  (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const qty = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const amount = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const total = (n: number) =>
  n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const kg3 = (n: number) => n.toFixed(3);
const kg2 = (n: number) => n.toFixed(2);

/** "2026-06-11" -> "11-06-2026", as the office writes it. */
function dmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

export async function renderCustomsInvoice(
  input: CustomsInvoiceDto,
): Promise<ReactElement> {
  const { Document, Page, Text, View, StyleSheet, Font } =
    await import('@react-pdf/renderer');
  ensureFontRegistered(Font);

  const s = StyleSheet.create({
    page: {
      padding: 24,
      fontFamily: 'NotoSans',
      fontSize: 8.5,
      color: INK,
    },
    frame: { borderWidth: RULE, borderColor: INK },
    title: {
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: 10,
      paddingVertical: 2,
      borderBottomWidth: RULE,
    },
    row: { flexDirection: 'row' },
    left: { width: '52%', borderRightWidth: RULE },
    right: { width: '48%' },
    pad: { paddingHorizontal: 4, paddingVertical: 1.5 },
    heading: { fontWeight: 'bold', textDecoration: 'underline' },
    label: { textDecoration: 'underline' },
    bold: { fontWeight: 'bold' },
    center: { textAlign: 'center' },
    ruleTop: { borderTopWidth: RULE },
    ruleBottom: { borderBottomWidth: RULE },
    ruleRight: { borderRightWidth: RULE },
    th: {
      fontWeight: 'bold',
      textDecoration: 'underline',
      textAlign: 'center',
      paddingVertical: 2,
    },
    cell: { paddingHorizontal: 4, paddingVertical: 2 },
  });

  const t = (content: string, style: object | object[] = []): ReactElement =>
    h(Text, { style: [s.pad, ...[style].flat()] as never }, content);

  const destination = input.countryOfDestination.trim();
  const terms = input.terms?.trim() || CUSTOMS_INVOICE_DEFAULT_TERMS;
  const declaration = lines(
    input.declaration?.trim() || customsInvoiceDefaultDeclaration(destination),
  );
  const boxWeight = input.boxes.reduce((sum, b) => sum + (b.weightKg || 0), 0);
  const totalWeight = input.totalWeightKg ?? boxWeight;
  const grand = customsInvoiceTotal(input.boxes);

  // ---- Consignor / consignee (left) -------------------------------------------------------
  const consignor = h(
    View,
    { style: [s.ruleBottom, { paddingBottom: 2 }] },
    t('CONSIGNOR', s.heading),
    t(input.consignorName.toUpperCase(), s.bold),
    ...lines(input.consignorAddress).map((l) => t(l.toUpperCase())),
    input.consignorPhone ? t(`PH NO. ${input.consignorPhone}`) : null,
    input.consignorIdNumber
      ? t(
          `${(input.consignorIdLabel?.trim() || 'AADHAAR NO.').toUpperCase()} ${input.consignorIdNumber}`,
          s.bold,
        )
      : null,
  );
  const consignee = h(
    View,
    { style: { paddingBottom: 2 } },
    t('CONSIGNEE', s.heading),
    t(input.consigneeName.toUpperCase(), s.bold),
    ...lines(input.consigneeAddress).map((l) => t(l.toUpperCase())),
    t(input.consigneeCountry.toUpperCase(), s.bold),
    input.consigneePhone ? t(`Ph no. ${input.consigneePhone}`, s.bold) : null,
  );

  // ---- Invoice no, boxes, countries, terms (right) ----------------------------------------
  const pair = (a: string, b: string, va?: string | null, vb?: string | null) =>
    h(
      View,
      { style: [s.row, s.ruleBottom] },
      h(
        View,
        { style: [{ width: '50%' }, s.ruleRight] },
        t(a, s.label),
        t((va ?? '').toUpperCase(), [s.bold, s.center]),
      ),
      h(
        View,
        { style: { width: '50%' } },
        t(b, s.label),
        t((vb ?? '').toUpperCase(), [s.bold, s.center]),
      ),
    );

  const right = h(
    View,
    { style: s.right },
    h(
      View,
      { style: [s.ruleBottom, { paddingBottom: 2 }] },
      t('Invoice No. & Date', [s.label, s.center]),
      t(
        [input.invoiceNumber?.trim(), dmy(input.invoiceDate)]
          .filter(Boolean)
          .join('   '),
        [s.bold, s.center],
      ),
      ...input.boxes.map((box, i) =>
        t(
          `BOX - ${i + 1} WEIGHT : ${kg3(box.weightKg)}KGS${box.dimensions?.trim() ? ` ${box.dimensions.trim()}` : ''}`,
          [s.bold, s.center],
        ),
      ),
      h(View, { style: { minHeight: 18 } }),
      t(`TOTAL WEIGHT : ${kg2(totalWeight)}KGS`, [
        s.bold,
        { textAlign: 'right', paddingRight: 24 },
      ]),
    ),
    h(
      View,
      { style: [s.ruleBottom, { minHeight: 44 }] },
      t('Buyer (If other than consignee)', s.label),
      input.buyer?.trim() ? t(input.buyer.trim().toUpperCase(), s.bold) : null,
    ),
    pair(
      'Country of Origin of Goods',
      'Country of Final Destination',
      input.countryOfOrigin,
      destination,
    ),
    h(
      View,
      { style: { minHeight: 30 } },
      t('Terms of Delivery and Payment', s.label),
      t(terms.toUpperCase(), [s.bold, s.center]),
    ),
  );

  // ---- Shipping particulars ---------------------------------------------------------------
  const shipping = h(
    View,
    { style: [s.row, s.ruleTop] },
    h(
      View,
      { style: s.left },
      pair(
        'Pre Carriage by',
        'Place of Receipt by Pre-carrier',
        input.preCarriageBy,
        input.placeOfReceipt,
      ),
      pair(
        'Vessel/Flight No',
        'Port of Loading',
        input.vesselFlightNo,
        input.portOfLoading || input.countryOfOrigin,
      ),
      h(
        View,
        { style: s.row },
        h(
          View,
          { style: [{ width: '50%' }, s.ruleRight] },
          t('Port of Discharge', s.label),
          t((input.portOfDischarge ?? '').toUpperCase(), [s.bold, s.center]),
        ),
        h(
          View,
          { style: { width: '50%' } },
          t('Final Destination', s.label),
          t((input.finalDestination || destination).toUpperCase(), [
            s.bold,
            s.center,
          ]),
        ),
      ),
    ),
    h(View, { style: s.right }),
  );

  // ---- Goods ------------------------------------------------------------------------------
  const W = ['8%', '54%', '12%', '12%', '14%'];
  const tr = (cells: (ReactElement | null)[], style: object[] = []) =>
    h(
      View,
      { style: [s.row, ...style] as never, wrap: false },
      ...cells.map((c, i) =>
        h(
          View,
          {
            key: i,
            style: [{ width: W[i] }, i < cells.length - 1 ? s.ruleRight : {}],
          },
          c,
        ),
      ),
    );
  const cellText = (
    text: string,
    align: 'left' | 'center' | 'right' = 'center',
    extra: object = {},
  ): ReactElement =>
    h(Text, { style: [s.cell, { textAlign: align }, extra] as never }, text);

  let serial = 0;
  const bodyRows: ReactElement[] = [];
  input.boxes.forEach((box, b) => {
    bodyRows.push(
      tr([
        null,
        cellText(`BOX - ${b + 1}`, 'center', s.bold),
        null,
        null,
        null,
      ]),
    );
    for (const item of box.items) {
      serial += 1;
      bodyRows.push(
        tr([
          cellText(String(serial)),
          cellText(item.description.toUpperCase()),
          cellText(qty(item.quantity)),
          cellText(amount(item.rate)),
          cellText(amount(item.quantity * item.rate)),
        ]),
      );
    }
  });

  const goods = h(
    View,
    { style: s.ruleTop },
    tr(
      [
        cellText('S.NO', 'center', s.th),
        cellText('Description of Goods', 'center', s.th),
        cellText('Quantity', 'center', s.th),
        cellText('RATE', 'center', s.th),
        cellText('VALUE', 'center', s.th),
      ],
      [s.ruleBottom],
    ),
    ...bodyRows,
    // The ruled columns run down to the total, as on the paper form.
    tr(
      [null, null, null, null, null],
      [{ minHeight: Math.max(30, 150 - bodyRows.length * 14) }],
    ),
    tr(
      [
        null,
        cellText('TOTAL AMOUNT IN INR', 'center', s.bold),
        null,
        cellText('INR', 'center', s.bold),
        cellText(total(grand), 'right', s.bold),
      ],
      [s.ruleTop],
    ),
  );

  // ---- Declaration and signature ----------------------------------------------------------
  const footer = h(
    View,
    { style: [s.row, s.ruleTop], wrap: false },
    h(
      View,
      { style: [{ width: '64%' }, s.ruleRight] },
      ...declaration.map((l, i) =>
        h(
          Text,
          {
            key: i,
            style: [s.pad, i < declaration.length - 1 ? s.ruleBottom : {}],
          },
          l,
        ),
      ),
    ),
    h(
      View,
      {
        style: {
          width: '36%',
          justifyContent: 'flex-end',
          minHeight: 64,
        },
      },
      t('Signature & Date', s.center),
    ),
  );

  return h(
    Document,
    {
      title: `Invoice ${input.consignorName} to ${input.consigneeName}`,
      author: 'NationWide Logistics',
    },
    h(
      Page,
      { size: 'A4', style: s.page },
      h(
        View,
        { style: s.frame },
        h(Text, { style: s.title }, 'INVOICE'),
        h(
          View,
          { style: s.row },
          h(View, { style: s.left }, consignor, consignee),
          right,
        ),
        shipping,
        goods,
        footer,
      ),
    ),
  );
}
