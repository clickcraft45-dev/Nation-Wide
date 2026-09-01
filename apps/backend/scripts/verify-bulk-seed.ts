/**
 * Integrity check for the database seed-bulk.ts produces.
 *
 *   npx ts-node --transpile-only scripts/verify-bulk-seed.ts
 *
 * Asserts the invariants the application relies on and MongoDB cannot enforce itself: no dangling
 * references, invoice columns that add up to their own totals, a gapless invoice series per
 * financial year, sequence counters ahead of the rows they numbered, and status fields that agree
 * with the records behind them. Exits non-zero on the first failure, so it works as a smoke test
 * after any bulk load.
 *
 * Reads through the MongoDB driver rather than Prisma: these are aggregations over whole
 * collections, and Prisma has no $lookup.
 */
import 'dotenv/config';
import { Db, MongoClient } from 'mongodb';
import { round2 } from '../src/modules/invoices/gst';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Rows in `from` whose `field` points at a `to` document that does not exist. */
async function orphans(db: Db, from: string, field: string, to: string): Promise<number> {
  const [result] = await db
    .collection(from)
    .aggregate([
      { $match: { [field]: { $type: 'string' } } },
      { $lookup: { from: to, localField: field, foreignField: '_id', as: 'hit' } },
      { $match: { hit: { $size: 0 } } },
      { $count: 'n' },
    ])
    .toArray();
  return result?.n ?? 0;
}

async function main() {
  const client = new MongoClient(process.env.DATABASE_URL!);
  await client.connect();
  const db = client.db();

  // --- Referential integrity -----------------------------------------------
  const refs: [string, string, string][] = [
    ['quotes', 'customer_id', 'customers'],
    ['orders', 'customer_id', 'customers'],
    ['quotes', 'order_id', 'orders'],
    ['quotes', 'selected_option_id', 'rate_quote_options'],
    ['rate_quote_options', 'quote_id', 'quotes'],
    ['pickup_requests', 'quote_id', 'quotes'],
    ['pickup_requests', 'customer_id', 'customers'],
    ['pickup_requests', 'order_id', 'orders'],
    ['pickups', 'quote_id', 'quotes'],
    ['shipments', 'order_id', 'orders'],
    ['tracking_events', 'shipment_id', 'shipments'],
    ['tracking_events', 'canonical_status_id', 'tracking_statuses'],
    ['external_tracking_numbers', 'shipment_id', 'shipments'],
    ['invoices', 'customer_id', 'customers'],
    ['invoices', 'order_id', 'orders'],
    ['notifications', 'customer_id', 'customers'],
    ['audit_logs', 'actor_id', 'admin_users'],
    ['api_request_logs', 'shipment_id', 'shipments'],
  ];
  for (const [from, field, to] of refs) {
    const n = await orphans(db, from, field, to);
    check(`${from}.${field} -> ${to}`, n === 0, n ? `${n} dangling` : '');
  }

  // --- Invoice arithmetic ---------------------------------------------------
  // Every invoice must add up on its own face, and carry either CGST+SGST or IGST, never both.
  const badInvoices = await db
    .collection('invoices')
    .aggregate([
      {
        $project: {
          invoice_number: 1,
          sumMismatch: {
            $gt: [
              {
                $abs: {
                  $subtract: [
                    '$total_amount',
                    { $add: ['$taxable_value', '$total_tax', '$non_taxable_charges'] },
                  ],
                },
              },
              0.02,
            ],
          },
          splitMismatch: {
            $gt: [
              { $abs: { $subtract: ['$total_tax', { $add: ['$cgst_amount', '$sgst_amount', '$igst_amount'] }] } },
              0.02,
            ],
          },
          bothRegimes: {
            $and: [{ $gt: ['$igst_amount', 0] }, { $gt: [{ $add: ['$cgst_amount', '$sgst_amount'] }, 0] }],
          },
        },
      },
      { $match: { $or: [{ sumMismatch: true }, { splitMismatch: true }, { bothRegimes: true }] } },
      { $limit: 5 },
    ])
    .toArray();
  check(
    'invoice totals and CGST/SGST-vs-IGST split',
    badInvoices.length === 0,
    badInvoices.map((i) => i.invoice_number).join(', '),
  );

  // Intra-state supply must be CGST+SGST, inter-state must be IGST — the one thing an auditor
  // checks first, and it is derived from two snapshotted columns, so it is checkable here.
  const wrongRegime = await db
    .collection('invoices')
    .countDocuments({
      $or: [
        { $expr: { $and: [{ $eq: ['$supplier_state_code', '$place_of_supply_code'] }, { $gt: ['$igst_amount', 0] }] } },
        { $expr: { $and: [{ $ne: ['$supplier_state_code', '$place_of_supply_code'] }, { $gt: ['$cgst_amount', 0] }] } },
      ],
    });
  check('place of supply decides CGST+SGST vs IGST', wrongRegime === 0, `${wrongRegime} wrong`);

  // --- Invoice series -------------------------------------------------------
  const series = await db
    .collection('invoices')
    .aggregate([
      {
        $group: {
          _id: '$financial_year',
          count: { $sum: 1 },
          min: { $min: '$sequence_number' },
          max: { $max: '$sequence_number' },
          distinct: { $addToSet: '$sequence_number' },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  for (const fy of series) {
    // GST requires the series to be consecutive within a financial year: 1..N with no gaps and
    // no repeats. A gap is the first thing an auditor asks about.
    const gapless = fy.min === 1 && fy.max === fy.count && fy.distinct.length === fy.count;
    check(`invoice series ${fy._id} is 1..${fy.count} with no gaps`, gapless, `min ${fy.min} max ${fy.max}`);

    const counter = await db.collection('counters').findOne({ _id: `invoice:${fy._id}` as any });
    check(`counter invoice:${fy._id} >= ${fy.max}`, (counter?.value ?? 0) >= fy.max, `counter ${counter?.value ?? 'missing'}`);
  }

  const invoiceTotal = await db.collection('invoices').countDocuments();
  const distinctNumbers = (await db.collection('invoices').distinct('invoice_number')).length;
  check('invoice numbers unique', invoiceTotal === distinctNumbers, `${invoiceTotal} rows / ${distinctNumbers} numbers`);

  // --- Shipment numbering ---------------------------------------------------
  const [seq] = await db
    .collection('shipments')
    .aggregate([{ $group: { _id: null, max: { $max: '$sequence_number' }, n: { $sum: 1 } } }])
    .toArray();
  const distinctSeq = (await db.collection('shipments').distinct('sequence_number')).length;
  check('shipment sequence numbers unique', (seq?.n ?? 0) === distinctSeq, `${seq?.n} rows / ${distinctSeq} numbers`);
  const shipmentCounter = await db.collection('counters').findOne({ _id: 'shipment' as any });
  check(
    `counter shipment >= ${seq?.max ?? 0}`,
    (shipmentCounter?.value ?? 0) >= (seq?.max ?? 0),
    `counter ${shipmentCounter?.value ?? 'missing'}`,
  );

  // --- Status coherence -----------------------------------------------------
  // An ACCEPTED quote means an Order exists — that is what the status is defined as.
  const acceptedWithoutOrder = await db
    .collection('quotes')
    .countDocuments({ status: 'ACCEPTED', order_id: null });
  check('every ACCEPTED quote has an order', acceptedWithoutOrder === 0, `${acceptedWithoutOrder} without`);

  const completedWithoutOrder = await db
    .collection('pickup_requests')
    .countDocuments({ status: 'COMPLETED', order_id: null });
  check('every COMPLETED pickup request has an order', completedWithoutOrder === 0, `${completedWithoutOrder} without`);

  // Shipment.currentStatus is a denormalised cache of the latest tracking event; if it drifts,
  // the tracking page shows one thing and the timeline another.
  const staleCache = await db
    .collection('shipments')
    .aggregate([
      { $lookup: { from: 'tracking_events', localField: '_id', foreignField: 'shipment_id', as: 'ev' } },
      { $match: { 'ev.0': { $exists: true } } },
      {
        $addFields: {
          latest: { $arrayElemAt: [{ $sortArray: { input: '$ev', sortBy: { event_time: -1 } } }, 0] },
        },
      },
      {
        $lookup: {
          from: 'tracking_statuses',
          localField: 'latest.canonical_status_id',
          foreignField: '_id',
          as: 'st',
        },
      },
      { $match: { $expr: { $ne: ['$current_status', { $arrayElemAt: ['$st.code', 0] }] } } },
      { $count: 'n' },
    ])
    .toArray();
  check('shipment.currentStatus matches its latest tracking event', (staleCache[0]?.n ?? 0) === 0, `${staleCache[0]?.n ?? 0} stale`);

  // A cancelled order is not a supply and must never carry an invoice.
  const invoicedCancelled = await db
    .collection('invoices')
    .aggregate([
      { $lookup: { from: 'orders', localField: 'order_id', foreignField: '_id', as: 'o' } },
      { $match: { 'o.status': 'CANCELLED' } },
      { $count: 'n' },
    ])
    .toArray();
  check('no invoice against a cancelled order', (invoicedCancelled[0]?.n ?? 0) === 0, `${invoicedCancelled[0]?.n ?? 0} found`);

  // --- Priced options match the engine --------------------------------------
  // Spot-check the frozen snapshots: base + PSS + fuel must equal the taxable subtotal, and
  // subtotal + GST + cut the final price. If these drift the invoices built on them are wrong.
  const options = await db.collection('rate_quote_options').aggregate([{ $sample: { size: 500 } }]).toArray();
  const badOption = options.find(
    (o) =>
      Math.abs(round2(o.base_rate + o.pss_amount + o.fuel_charge_amount) - o.taxable_subtotal) > 0.02 ||
      Math.abs(round2(o.taxable_subtotal + o.gst_amount + o.nationwide_cut) - o.final_price) > 0.02,
  );
  check(`rate option breakdown adds up (${options.length} sampled)`, !badOption, badOption?._id ?? '');

  const stats = (await db.command({ dbStats: 1 })) as any;
  console.log();
  console.log(
    `${(stats.dataSize / 1048576).toFixed(1)} MB data | ${(stats.storageSize / 1048576).toFixed(1)} MB storage | ` +
      `${(stats.indexSize / 1048576).toFixed(1)} MB indexes | ${stats.objects.toLocaleString()} docs`,
  );
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`);

  await client.close();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
