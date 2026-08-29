/* Read-only: prints the Mongo indexes on the collections whose optional unique fields can hold
 * many empty values (see fix-nullable-unique-indexes.js for why that matters).
 *
 * Uses the MongoDB driver rather than Prisma's `$runCommandRaw`: Prisma's raw layer encodes any
 * single-key `$…` object as one of its own tagged values, so it can neither send nor read back a
 * partialFilterExpression like `{ $type: 'string' }` — it throws "Unknown tagged value".
 *
 *   node scripts/inspect-indexes.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const COLLECTIONS = ['customers', 'quotes', 'pickups', 'pickup_requests', 'notifications'];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    for (const name of COLLECTIONS) {
      console.log(`\n== ${name}`);
      const indexes = await db.collection(name).indexes();
      for (const index of indexes) {
        console.log(
          `${index.name} keys=${JSON.stringify(index.key)} unique=${Boolean(index.unique)} ` +
            `sparse=${Boolean(index.sparse)} partial=${index.partialFilterExpression ? JSON.stringify(index.partialFilterExpression) : 'none'}`,
        );
      }
      console.log(`rows: ${await db.collection(name).countDocuments()}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
