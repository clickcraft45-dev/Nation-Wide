/* Rebuilds the unique indexes on OPTIONAL fields so they ignore rows that have no value.
 *
 * MongoDB indexes a missing field as null, so a plain unique index on a nullable column allows
 * exactly ONE document without a value. Prisma's `db push` creates these indexes plain, which
 * means, on a fresh push:
 *
 *   - a second staff-entered Customer with no email -> P2002 on customers_email_key
 *   - a second Quote with no order yet              -> P2002 on quotes_order_id_key
 *   - a second Quote with no selected option        -> P2002 on quotes_selected_option_id_key
 *   - a second Pickup with no order yet             -> P2002 on pickups_order_id_key
 *   - a second PickupRequest with no order yet      -> P2002 on pickup_requests_order_id_key
 *   - a second queued Notification (no provider id) -> P2002 on notifications_provider_message_id_key
 *
 * ...i.e. two customers could never have an un-fulfilled quote at the same time.
 *
 * PARTIAL, not sparse. A sparse index only skips documents where the field is ABSENT — one whose
 * field is present and explicitly null is still indexed, so writing null to that column on two
 * rows collides all over again. `partialFilterExpression: { field: { $type: 'string' } }` indexes
 * only rows that actually hold an id, which covers both shapes. Uniqueness is unchanged for real
 * values.
 *
 * Uses the MongoDB driver, not Prisma's `$runCommandRaw`: Prisma's raw layer encodes any
 * single-key `$…` object as one of its own tagged values, so it can neither send nor read back a
 * partialFilterExpression — it throws "Unknown tagged value".
 *
 * Idempotent: an index already carrying the right filter is left alone. Safe to re-run, and it
 * MUST be re-run after any `prisma db push` — that recreates these indexes from the schema, and
 * Prisma's MongoDB connector cannot express a partial index in the datamodel.
 *
 *   node scripts/fix-nullable-unique-indexes.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

// Every `@unique` field declared optional in schema.prisma. Kept in sync by hand — a new
// optional unique column needs a row here, or it inherits the same bug.
const TARGETS = [
  { collection: 'customers', field: 'email', name: 'customers_email_key' },
  { collection: 'quotes', field: 'order_id', name: 'quotes_order_id_key' },
  { collection: 'quotes', field: 'selected_option_id', name: 'quotes_selected_option_id_key' },
  { collection: 'pickups', field: 'order_id', name: 'pickups_order_id_key' },
  { collection: 'pickup_requests', field: 'order_id', name: 'pickup_requests_order_id_key' },
  {
    collection: 'notifications',
    field: 'provider_message_id',
    name: 'notifications_provider_message_id_key',
  },
  // Nullable since standalone invoices (a re-delivery fee, a packaging charge) have no order —
  // without the partial filter, the second such invoice ever raised collides with the first.
  { collection: 'invoices', field: 'order_id', name: 'invoices_order_id_key' },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();

    for (const target of TARGETS) {
      const collection = db.collection(target.collection);
      const indexes = await collection.indexes();
      const existing = indexes.find((index) => index.name === target.name);
      const wanted = { [target.field]: { $type: 'string' } };

      if (!existing) {
        await collection.createIndex(
          { [target.field]: 1 },
          { name: target.name, unique: true, partialFilterExpression: wanted },
        );
        console.log(`${target.name}: created as unique + partial (values only).`);
        continue;
      }

      if (JSON.stringify(existing.partialFilterExpression ?? null) === JSON.stringify(wanted)) {
        console.log(`${target.name}: already partial.`);
        continue;
      }

      await collection.dropIndex(target.name);
      await collection.createIndex(
        { [target.field]: 1 },
        { name: target.name, unique: true, partialFilterExpression: wanted },
      );
      console.log(`${target.name}: recreated as unique + partial (values only).`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
