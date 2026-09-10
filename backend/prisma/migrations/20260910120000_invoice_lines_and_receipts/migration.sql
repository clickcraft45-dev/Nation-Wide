-- Consolidated invoices and payment receipts.
--
-- Additive apart from three new nullable columns on "invoices", so it is safe on a populated
-- database: every existing invoice becomes kind = 'ORDER' (or 'CUSTOM' where it has no order),
-- which is what those rows already are.
--
-- WHY TWO TABLES.
--
-- "invoice_lines" exists because a consolidated invoice bills many orders on one document, and
-- the old shape could only describe one supply per invoice (order_id, or a single custom
-- description). The line stores its own amounts rather than pointing at the order's current
-- price: an invoice is a statutory snapshot, and re-pricing an order next month must not change
-- a document the customer has already filed. order_id is UNIQUE, which makes "an order appears
-- on at most one consolidated invoice" a database guarantee rather than a service-layer check.
--
-- "receipts" exists because an invoice and a receipt are different documents. The invoice is the
-- demand and is a tax document at issue; the receipt acknowledges money that arrived, is raised
-- by whoever took it (an admin marking a transfer, a partner taking cash at the door), and
-- carries its own series. Its invoice_id is nullable on purpose — payment can be recorded before
-- an invoice exists (incomplete company settings block invoicing but must not block a receipt),
-- and the customer still needs proof they paid.
--
-- Tax is deliberately NOT on the line. GST is charged once on the invoice's total taxable value;
-- storing it per line and summing invites rounding drift between the lines and the total, which
-- is exactly the discrepancy an audit picks up.

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('ORDER', 'CUSTOM', 'CONSOLIDATED');

-- AlterTable
ALTER TABLE "invoices"
    ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'ORDER',
    ADD COLUMN "period_from" TIMESTAMP(3),
    ADD COLUMN "period_to" TIMESTAMP(3);

-- Existing invoices with no order behind them are one-offs, which is what CUSTOM means. Done
-- here rather than left to the default so the column describes reality from the first deploy.
UPDATE "invoices" SET "kind" = 'CUSTOM' WHERE "order_id" IS NULL;

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supply_date" TIMESTAMP(3) NOT NULL,
    "taxable_value" DOUBLE PRECISION NOT NULL,
    "non_taxable_charges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "financial_year" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "invoice_id" TEXT,
    "supplier_name" TEXT NOT NULL,
    "supplier_gstin" TEXT,
    "supplier_address" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "recorded_by_admin_id" TEXT,
    "pdf_path" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_order_id_key" ON "invoice_lines"("order_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_financial_year_sequence_number_key" ON "receipts"("financial_year", "sequence_number");

-- CreateIndex
CREATE INDEX "receipts_customer_id_received_at_idx" ON "receipts"("customer_id", "received_at");

-- CreateIndex
CREATE INDEX "receipts_order_id_idx" ON "receipts"("order_id");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_recorded_by_admin_id_fkey" FOREIGN KEY ("recorded_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
