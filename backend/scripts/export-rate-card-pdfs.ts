/**
 * One-shot: copies rate-card PDFs out of the legacy `rate_card_documents.pdf` BYTEA column and
 * into S3, at exactly the keys 20260906000000_reconcile_production_schema backfilled into
 * `storage_key`.
 *
 * Run this AFTER that migration (which creates storage_key) and BEFORE the follow-up migration
 * that drops the `pdf` column. Until it has run, the bytes exist only in Postgres.
 *
 * Idempotent: re-uploading an object to the same key is a no-op overwrite, so a partial run is
 * resumed simply by running it again.
 *
 *   npm run db:export-rate-card-pdfs --workspace=backend
 */
import { PrismaClient } from '@prisma/client';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

// Same configuration contract as StorageService: bucket from the environment, credentials from
// the instance IAM role via the SDK default provider chain. No key pair is read here either.
const bucket = process.env.S3_BUCKET_NAME ?? '';
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });

interface LegacyRow {
  id: string;
  storage_key: string;
  pdf: Buffer | null;
}

async function alreadyUploaded(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!bucket) {
    throw new Error('S3_BUCKET_NAME is not set — refusing to run. See docs/ENV_VARS.md.');
  }

  // Raw SQL because the `pdf` column is intentionally absent from schema.prisma — the Prisma
  // client has no field for it. This script is the only thing that still reads it.
  const rows = await prisma.$queryRawUnsafe<LegacyRow[]>(
    'SELECT "id", "storage_key", "pdf" FROM "rate_card_documents" ORDER BY "created_at"',
  );

  if (rows.length === 0) {
    console.log('No rate_card_documents rows. Nothing to export.');
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  const empty: string[] = [];

  for (const row of rows) {
    if (!row.pdf || row.pdf.length === 0) {
      empty.push(row.id);
      continue;
    }
    if (await alreadyUploaded(row.storage_key)) {
      skipped += 1;
      continue;
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: row.storage_key,
        Body: row.pdf,
        ContentType: 'application/pdf',
      }),
    );
    uploaded += 1;
    console.log(`  ${row.storage_key}  (${row.pdf.length} bytes)`);
  }

  console.log(`\n${rows.length} row(s): ${uploaded} uploaded, ${skipped} already in S3.`);

  if (empty.length > 0) {
    // Not fatal, but the follow-up drop migration would destroy nothing recoverable for these.
    console.warn(`WARNING: ${empty.length} row(s) had an empty pdf column: ${empty.join(', ')}`);
  }

  const verified = uploaded + skipped;
  if (verified !== rows.length - empty.length) {
    throw new Error('Export incomplete — do NOT drop the pdf column yet.');
  }
  console.log('All PDFs are in S3. Safe to apply the follow-up migration that drops "pdf".');
}

main()
  .catch((error: Error) => {
    console.error(`Rate-card PDF export failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
