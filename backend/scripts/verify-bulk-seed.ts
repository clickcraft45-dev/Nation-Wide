/**
 * Integrity check for the database seed-bulk.ts produces.
 *
 *   npx ts-node --transpile-only scripts/verify-bulk-seed.ts
 *
 * Asserts the invariants the application relies on but the schema cannot express: invoice columns
 * that add up to their own totals, a gapless invoice series per financial year, sequence counters
 * ahead of the rows they numbered, and status fields that agree with the records behind them.
 * Exits non-zero on the first failure, so it works as a smoke test after any bulk load.
 *
 * The referential-integrity half of this script is gone: every one of those 18 "does this id
 * point at a row that exists" checks is now a real FOREIGN KEY constraint, so a dangling
 * reference cannot be inserted in the first place. Postgres enforces it; there is nothing left
 * here to verify.
 *
 * Raw SQL rather than Prisma queries: these are whole-table aggregates, which is what SQL is for.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { round2 } from '../src/modules/invoices/gst';

const prisma = new PrismaClient();
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function count(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql);
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  // --- Invoice arithmetic ---------------------------------------------------
  // Every invoice must add up on its own face, and carry either CGST+SGST or IGST, never both.
  const badInvoices = await prisma.$queryRawUnsafe<{ invoice_number: string }[]>(`
    SELECT invoice_number FROM invoices
    WHERE ABS(total_amount - (taxable_value + total_tax + non_taxable_charges)) > 0.02
       OR ABS(total_tax - (cgst_amount + sgst_amount + igst_amount)) > 0.02
       OR (igst_amount > 0 AND (cgst_amount + sgst_amount) > 0)
    LIMIT 5
  `);
  check(
    'invoice totals and CGST/SGST-vs-IGST split',
    badInvoices.length === 0,
    badInvoices.map((i) => i.invoice_number).join(', '),
  );

  // Intra-state supply must be CGST+SGST, inter-state must be IGST — the one thing an auditor
  // checks first, and it is derived from two snapshotted columns, so it is checkable here.
  const wrongRegime = await count(`
    SELECT COUNT(*)::bigint AS n FROM invoices
    WHERE (supplier_state_code = place_of_supply_code AND igst_amount > 0)
       OR (supplier_state_code <> place_of_supply_code AND cgst_amount > 0)
  `);
  check('place of supply decides CGST+SGST vs IGST', wrongRegime === 0, `${wrongRegime} wrong`);

  // --- Invoice series -------------------------------------------------------
  const series = await prisma.$queryRawUnsafe<
    { financial_year: string; n: bigint; min: number; max: number; distinct: bigint }[]
  >(`
    SELECT financial_year,
           COUNT(*)::bigint AS n,
           MIN(sequence_number) AS min,
           MAX(sequence_number) AS max,
           COUNT(DISTINCT sequence_number)::bigint AS distinct
    FROM invoices GROUP BY financial_year ORDER BY financial_year
  `);
  for (const fy of series) {
    // GST requires the series to be consecutive within a financial year: 1..N with no gaps and
    // no repeats. A gap is the first thing an auditor asks about.
    const n = Number(fy.n);
    const gapless = fy.min === 1 && fy.max === n && Number(fy.distinct) === n;
    check(`invoice series ${fy.financial_year} is 1..${n} with no gaps`, gapless, `min ${fy.min} max ${fy.max}`);

    const counter = await prisma.counter.findUnique({ where: { id: `invoice:${fy.financial_year}` } });
    check(
      `counter invoice:${fy.financial_year} >= ${fy.max}`,
      (counter?.value ?? 0) >= fy.max,
      `counter ${counter?.value ?? 'missing'}`,
    );
  }

  const invoiceTotal = await count(`SELECT COUNT(*)::bigint AS n FROM invoices`);
  const distinctNumbers = await count(`SELECT COUNT(DISTINCT invoice_number)::bigint AS n FROM invoices`);
  check('invoice numbers unique', invoiceTotal === distinctNumbers, `${invoiceTotal} rows / ${distinctNumbers} numbers`);

  // --- Shipment numbering ---------------------------------------------------
  const [seq] = await prisma.$queryRawUnsafe<{ max: number | null; n: bigint; distinct: bigint }[]>(`
    SELECT MAX(sequence_number) AS max,
           COUNT(*)::bigint AS n,
           COUNT(DISTINCT sequence_number)::bigint AS distinct
    FROM shipments
  `);
  check(
    'shipment sequence numbers unique',
    Number(seq?.n ?? 0) === Number(seq?.distinct ?? 0),
    `${Number(seq?.n ?? 0)} rows / ${Number(seq?.distinct ?? 0)} numbers`,
  );
  const shipmentCounter = await prisma.counter.findUnique({ where: { id: 'shipment' } });
  check(
    `counter shipment >= ${seq?.max ?? 0}`,
    (shipmentCounter?.value ?? 0) >= (seq?.max ?? 0),
    `counter ${shipmentCounter?.value ?? 'missing'}`,
  );

  // --- Status coherence -----------------------------------------------------
  // An ACCEPTED quote means an Order exists — that is what the status is defined as.
  const acceptedWithoutOrder = await count(
    `SELECT COUNT(*)::bigint AS n FROM quotes WHERE status = 'ACCEPTED' AND order_id IS NULL`,
  );
  check('every ACCEPTED quote has an order', acceptedWithoutOrder === 0, `${acceptedWithoutOrder} without`);

  const completedWithoutOrder = await count(
    `SELECT COUNT(*)::bigint AS n FROM pickup_requests WHERE status = 'COMPLETED' AND order_id IS NULL`,
  );
  check('every COMPLETED pickup request has an order', completedWithoutOrder === 0, `${completedWithoutOrder} without`);

  // Shipment.currentStatus is a denormalised cache of the latest tracking event; if it drifts,
  // the tracking page shows one thing and the timeline another.
  const staleCache = await count(`
    SELECT COUNT(*)::bigint AS n FROM shipments s
    JOIN LATERAL (
      SELECT ts.code FROM tracking_events te
      JOIN tracking_statuses ts ON ts.id = te.canonical_status_id
      WHERE te.shipment_id = s.id ORDER BY te.event_time DESC LIMIT 1
    ) latest ON TRUE
    WHERE s.current_status IS DISTINCT FROM latest.code
  `);
  check('shipment.currentStatus matches its latest tracking event', staleCache === 0, `${staleCache} stale`);

  // A cancelled order is not a supply and must never carry an invoice.
  const invoicedCancelled = await count(`
    SELECT COUNT(*)::bigint AS n FROM invoices i
    JOIN orders o ON o.id = i.order_id WHERE o.status = 'CANCELLED'
  `);
  check('no invoice against a cancelled order', invoicedCancelled === 0, `${invoicedCancelled} found`);

  // --- Priced options match the engine --------------------------------------
  // Spot-check the frozen snapshots: base + PSS + fuel must equal the taxable subtotal, and
  // subtotal + GST + cut the final price. If these drift the invoices built on them are wrong.
  const options = await prisma.$queryRawUnsafe<
    {
      id: string;
      base_rate: number;
      pss_amount: number;
      fuel_charge_amount: number;
      taxable_subtotal: number;
      gst_amount: number;
      nationwide_cut: number;
      final_price: number;
    }[]
  >(`SELECT * FROM rate_quote_options ORDER BY random() LIMIT 500`);
  const badOption = options.find(
    (o) =>
      Math.abs(round2(o.base_rate + o.pss_amount + o.fuel_charge_amount) - o.taxable_subtotal) > 0.02 ||
      Math.abs(round2(o.taxable_subtotal + o.gst_amount + o.nationwide_cut) - o.final_price) > 0.02,
  );
  check(`rate option breakdown adds up (${options.length} sampled)`, !badOption, badOption?.id ?? '');

  const [size] = await prisma.$queryRawUnsafe<{ pretty: string }[]>(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty`,
  );
  console.log();
  console.log(`${size?.pretty ?? 'unknown'} database`);
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`);

  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
