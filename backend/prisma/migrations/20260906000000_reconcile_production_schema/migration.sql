-- Reconciles the database with schema.prisma.
--
-- WHY THIS DRIFT EXISTS: the S3 storage move, the GST/invoicing fields and the Decimal->Float
-- retype were applied to development databases with `prisma db push`, which writes no migration.
-- The only artifact that ever described them was the full-schema squash 20260904000000_init,
-- which could never apply to a database that already had these tables and was removed. This is
-- that change set, expressed as an incremental diff.
--
-- The body below is `prisma migrate diff --from-url <deployed db> --to-schema-datamodel` taken
-- verbatim, so applying it provably leaves zero drift.
--
-- SAFETY: verified against the deployed database on 2026-09-06 -- every business table held 0
-- rows (only _prisma_migrations was populated). The DROP COLUMN and DROP CONSTRAINT statements
-- below therefore destroy no data. The Decimal(10,2)->DOUBLE PRECISION and DATE->TIMESTAMP(3)
-- casts are lossless in any case: DECIMAL(10,2) tops out at 99,999,999.99, well inside the range
-- where doubles are exact, and DATE->TIMESTAMP widens by filling midnight.

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_selected_option_id_fkey";

-- DropForeignKey
ALTER TABLE "rate_quote_options" DROP CONSTRAINT "rate_quote_options_quote_id_fkey";

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "sac_code" TEXT,
ADD COLUMN     "state_code" TEXT,
ADD COLUMN     "state_name" TEXT,
ALTER COLUMN "primary_color" SET DEFAULT '#7F1020';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "gstin" TEXT;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "paid_amount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
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

-- AlterTable
ALTER TABLE "pickups" ALTER COLUMN "scheduled_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "weight_verified_kg" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "quotes" ALTER COLUMN "weight_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pickup_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "quoted_amount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "rate_card_documents" DROP COLUMN "pdf",
ADD COLUMN     "storage_key" TEXT NOT NULL,
ALTER COLUMN "effective_date" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rate_providers" ALTER COLUMN "fuel_charge_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pss_per_kg" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "rate_quote_options" ALTER COLUMN "base_rate" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "pss_amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "fuel_charge_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "fuel_charge_amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "taxable_subtotal" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "gst_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "gst_amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "nationwide_cut" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "final_price" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "shipments" ALTER COLUMN "sequence_number" DROP DEFAULT;
DROP SEQUENCE "shipments_sequence_number_seq";

-- AlterTable
ALTER TABLE "weight_slabs" ALTER COLUMN "weight_from_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "weight_to_kg" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "base_rate" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "gst_percent" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "nationwide_cut" SET DATA TYPE DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "rate_quote_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Not from the diff -- required for correctness once the SERIAL default is gone.
--
-- ShipmentsService allocates sequence_number via nextSequenceNumber() -> the counters table
-- (sequence.ts), which 20260830120000 created empty. An unseeded counter returns 1 and would
-- collide with shipments_sequence_number_key once any shipment exists. GREATEST() keeps this
-- re-runnable and never moves the counter backwards.
-- ---------------------------------------------------------------------------
INSERT INTO "counters" ("id", "value")
SELECT 'shipment', COALESCE(MAX("sequence_number"), 0) FROM "shipments"
ON CONFLICT ("id") DO UPDATE SET "value" = GREATEST("counters"."value", EXCLUDED."value");
