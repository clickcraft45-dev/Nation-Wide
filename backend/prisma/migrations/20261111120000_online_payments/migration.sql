-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('CREATED', 'OBSERVED', 'RECONCILED', 'MANUAL_REVIEW', 'FAILED', 'EXPIRED', 'CANCELLED', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "online_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'YOUPI',
    "amount_paise" INTEGER NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'CREATED',
    "gateway_payment_id" TEXT,
    "checkout_url" TEXT,
    "utr" TEXT,
    "note" TEXT,
    "reviewed_by_admin_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payment_events" (
    "id" TEXT NOT NULL,
    "online_payment_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_gateway_payment_id_key" ON "online_payments"("gateway_payment_id");

-- CreateIndex
CREATE INDEX "online_payments_order_id_idx" ON "online_payments"("order_id");

-- CreateIndex
CREATE INDEX "online_payments_customer_id_idx" ON "online_payments"("customer_id");

-- CreateIndex
CREATE INDEX "online_payments_status_idx" ON "online_payments"("status");

-- CreateIndex
CREATE INDEX "online_payment_events_online_payment_id_idx" ON "online_payment_events"("online_payment_id");

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_events" ADD CONSTRAINT "online_payment_events_online_payment_id_fkey" FOREIGN KEY ("online_payment_id") REFERENCES "online_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
