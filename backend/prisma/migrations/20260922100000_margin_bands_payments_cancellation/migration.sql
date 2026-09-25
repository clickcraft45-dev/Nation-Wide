-- Margin by weight band, richer payment records, and customer cancellation.
--
-- Margin was per weight slab only, so one commercial decision ("flat 1000 up to 10 kg") had to be
-- re-entered on every country and band; a band table holds it once per carrier. Payments gained
-- who paid and a note, plus a real refunded amount rather than inferring it from what was paid.
-- Cancellation freezes the fee that was quoted, since the settings behind it move.

CREATE TABLE "provider_margin_bands" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "from_kg" DOUBLE PRECISION NOT NULL,
    "to_kg" DOUBLE PRECISION,
    "flat_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "per_kg_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_margin_bands_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provider_margin_bands_rate_provider_id_idx" ON "provider_margin_bands"("rate_provider_id");

ALTER TABLE "provider_margin_bands" ADD CONSTRAINT "provider_margin_bands_rate_provider_id_fkey"
    FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "payment_payer_name" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_note" TEXT;
ALTER TABLE "orders" ADD COLUMN "refunded_amount" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "refunded_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "refund_note" TEXT;
ALTER TABLE "orders" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "orders" ADD COLUMN "cancellation_fee" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "cancellation_distance_km" DOUBLE PRECISION;

ALTER TABLE "company_settings" ADD COLUMN "cancellation_base_fee" DOUBLE PRECISION NOT NULL DEFAULT 500;
ALTER TABLE "company_settings" ADD COLUMN "cancellation_per_km_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "company_settings" ADD COLUMN "warehouse_latitude" DOUBLE PRECISION;
ALTER TABLE "company_settings" ADD COLUMN "warehouse_longitude" DOUBLE PRECISION;

-- Whether the per-km charge was measured along roads or fell back to the straight line: a
-- customer disputing the fee is owed the difference between those two answers.
ALTER TABLE "orders" ADD COLUMN "cancellation_distance_source" TEXT;
