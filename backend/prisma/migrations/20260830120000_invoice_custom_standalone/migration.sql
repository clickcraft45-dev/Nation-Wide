-- Repairs the gap this migration originally assumed away.
--
-- The Invoice and Counter models reached schema.prisma via `prisma db push` during development,
-- so no migration in this folder ever created `invoices`, `counters` or `InvoiceStatus`. This
-- migration shipped as two ALTER TABLE statements against `invoices` and failed in production
-- with "relation \"invoices\" does not exist" (P3018). It was marked rolled back with
-- `migrate resolve --rolled-back`, so `migrate deploy` retries it — this corrected body is what
-- the retry now runs.
--
-- It creates the final shape directly, with `order_id` already nullable and
-- `custom_line_description` already present, so the two original ALTERs are folded in rather
-- than replayed. DDL below is taken verbatim from
-- `prisma migrate diff --from-empty --to-schema-datamodel`, so names and types match exactly
-- what Prisma expects.
--
-- `counters` is included because it is missing from production too: sequence.ts allocates
-- shipment and invoice numbers with a raw INSERT ... ON CONFLICT against that table, so its
-- absence breaks shipment creation as well as invoicing.

-- CreateEnum
-- Guarded: CREATE TYPE has no IF NOT EXISTS, and an earlier `db push` against this database may
-- have left the type behind even though no table using it survived.
DO $$
BEGIN
    CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- CreateTable
CREATE TABLE "counters" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "financial_year" TEXT NOT NULL,
    "order_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "custom_line_description" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "supplier_gstin" TEXT NOT NULL,
    "supplier_address" TEXT NOT NULL,
    "supplier_state_name" TEXT NOT NULL,
    "supplier_state_code" TEXT NOT NULL,
    "supplier_email" TEXT,
    "supplier_phone" TEXT,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "recipient_gstin" TEXT,
    "recipient_address" TEXT,
    "place_of_supply_state" TEXT NOT NULL,
    "place_of_supply_code" TEXT NOT NULL,
    "sac_code" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "taxable_value" DOUBLE PRECISION NOT NULL,
    "cgst_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_tax" DOUBLE PRECISION NOT NULL,
    "non_taxable_charges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "breakdown_source" TEXT NOT NULL,
    "pdf_path" TEXT,
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "issued_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_customer_id_invoice_date_idx" ON "invoices"("customer_id", "invoice_date");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_financial_year_sequence_number_key" ON "invoices"("financial_year", "sequence_number");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_admin_id_fkey" FOREIGN KEY ("issued_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
