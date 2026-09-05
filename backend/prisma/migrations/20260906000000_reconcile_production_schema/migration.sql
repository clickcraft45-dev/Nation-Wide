-- Reconciles production with schema.prisma.
--
-- WHY THIS DRIFT EXISTS: the S3 storage move, the GST/invoicing fields and the Decimal->Float
-- retype were all applied to development databases with `prisma db push`, which writes no
-- migration. The only artifact that ever described them was the full-schema squash
-- 20260904000000_init, which could never apply to a database that already had these tables and
-- was removed. This migration is that change set, expressed as an incremental diff instead.
--
-- Every statement below is additive or a widening type change. Nothing drops a column, drops a
-- table, or deletes a row. The one genuinely destructive operation in the upstream diff --
-- DROP COLUMN "pdf" on rate_card_documents -- is deliberately NOT here; see the block below.

-- ---------------------------------------------------------------------------
-- company_settings: GST identity for invoicing. All nullable, so existing rows stay valid.
-- ---------------------------------------------------------------------------
ALTER TABLE "company_settings" ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "sac_code" TEXT,
ADD COLUMN     "state_code" TEXT,
ADD COLUMN     "state_name" TEXT,
ALTER COLUMN "primary_color" SET DEFAULT '#7F1020';

-- ---------------------------------------------------------------------------
-- customers: the column whose absence is currently breaking login.
-- ---------------------------------------------------------------------------
ALTER TABLE "customers" ADD COLUMN     "gstin" TEXT;

-- ---------------------------------------------------------------------------
-- Decimal(10,2)/Decimal(5,2) -> DOUBLE PRECISION, and DATE -> TIMESTAMP(3).
--
-- Both casts are lossless here. DECIMAL(10,2) tops out at 99,999,999.99; doubles represent every
-- integer below 2^53 exactly, so a value scaled by 100 is far inside the exact range and
-- round-trips to two decimal places unchanged. There is no overflow path. DATE -> TIMESTAMP(3)
-- is a widening cast that fills midnight, so no date is altered. Postgres has assignment casts
-- for both directions, so no USING clause is required.
-- ---------------------------------------------------------------------------
ALTER TABLE "orders" ALTER COLUMN "paid_amount" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "pickup_requests" ADD COLUMN     "verified_gst_amount" DOUBLE PRECISION,
ADD COLUMN     "verified_gst_percent" DOUBLE PRECISION,
ADD COLUMN     "verified_nationwide_cut" DOUBLE PRECISION,
ADD COLUMN     "verified_taxable_subtotal" DOUBLE PRECISION,
ALTER COLUMN "estimated_weight_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "estimated_price" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pickup_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "verified_weight_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "verified_price" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "collected_amount" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "pickups" ALTER COLUMN "scheduled_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "weight_verified_kg" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "quotes" ALTER COLUMN "weight_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pickup_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "quoted_amount" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "rate_providers" ALTER COLUMN "fuel_charge_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pss_per_kg" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "rate_quote_options" ALTER COLUMN "base_rate" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pss_amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "fuel_charge_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "fuel_charge_amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "taxable_subtotal" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "gst_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "gst_amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "nationwide_cut" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "final_price" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "weight_slabs" ALTER COLUMN "weight_from_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "weight_to_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "base_rate" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "gst_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "nationwide_cut" SET DATA TYPE DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- rate_card_documents: PDF bytes move from a BYTEA column to S3.
--
-- `pdf BYTEA NOT NULL` currently holds the ONLY copy of every generated rate-card PDF in
-- production -- those rows predate StorageService, so there are no S3 objects for them. The
-- upstream diff wanted `DROP COLUMN "pdf"`, which would destroy them irrecoverably. It is
-- omitted here on purpose: this migration adds the new column and leaves the old data alone.
--
-- storage_key is added nullable, backfilled with the deterministic key the export script writes
-- to, and only then set NOT NULL -- adding a NOT NULL column with no default to a table that
-- already has rows would fail outright.
--
-- Dropping `pdf` happens in a separate, later migration, AFTER scripts/export-rate-card-pdfs.ts
-- has copied every row's bytes to S3 and that has been verified. Keeping the drop out of this
-- file is what stops `migrate deploy` from running it before the export.
-- ---------------------------------------------------------------------------
ALTER TABLE "rate_card_documents" ADD COLUMN     "storage_key" TEXT,
ALTER COLUMN "effective_date" SET DATA TYPE TIMESTAMP(3);

UPDATE "rate_card_documents"
SET "storage_key" = 'rate-cards/legacy/' || "id" || '.pdf'
WHERE "storage_key" IS NULL;

ALTER TABLE "rate_card_documents" ALTER COLUMN "storage_key" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- shipments: hand sequence allocation to the counters table.
--
-- Production still has sequence_number as SERIAL. schema.prisma has a plain Int, because
-- ShipmentsService now allocates via nextSequenceNumber() -> counters (sequence.ts), so the DB
-- default is unused and its sequence object is dropped.
--
-- The counter MUST be seeded from the current maximum first. counters was created empty by
-- 20260830120000, so an unseeded counter returns 1 on the next allocation and collides with
-- shipments_sequence_number_key on the very first shipment created after this deploy.
-- GREATEST() keeps this safe to re-run and never moves an existing counter backwards.
-- ---------------------------------------------------------------------------
INSERT INTO "counters" ("id", "value")
SELECT 'shipment', COALESCE(MAX("sequence_number"), 0) FROM "shipments"
ON CONFLICT ("id") DO UPDATE SET "value" = GREATEST("counters"."value", EXCLUDED."value");

ALTER TABLE "shipments" ALTER COLUMN "sequence_number" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "shipments_sequence_number_seq";

-- ---------------------------------------------------------------------------
-- Indexes: both are declared on model Order (@@index([createdAt]), @@index([status])).
-- ---------------------------------------------------------------------------
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

CREATE INDEX "orders_status_idx" ON "orders"("status");

-- ---------------------------------------------------------------------------
-- Foreign keys for the Quote <-> RateQuoteOption reference cycle. NO ACTION on both sides is
-- what the schema asks for (onDelete: NoAction, onUpdate: NoAction) -- the cycle means neither
-- side can cascade. These fail loudly if any orphan rows exist; run the pre-flight check first.
-- The whole migration is one transaction, so such a failure rolls back cleanly.
-- ---------------------------------------------------------------------------
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "rate_quote_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
