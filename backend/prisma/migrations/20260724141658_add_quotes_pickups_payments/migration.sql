-- CreateEnum
CREATE TYPE "ShipmentTypeCode" AS ENUM ('DOCUMENT', 'PARCEL', 'PACKAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'WAREHOUSE_DROP_OFF');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SUBMITTED', 'NEEDS_MANUAL_REVIEW', 'QUOTED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteReviewReason" AS ENUM ('OVERSIZED', 'DANGEROUS_GOODS', 'RESTRICTED_DESTINATION', 'SPECIAL_HANDLING', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('SCHEDULED', 'PENDING', 'ASSIGNED', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'CANCELLED', 'PICKUP_FAILED', 'DROPPED_OFF');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'RAZORPAY');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_amount" DECIMAL(10,2),
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payment_marked_by_admin_id" TEXT,
ADD COLUMN     "payment_method" "PaymentMethod",
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "shipment_type" "ShipmentTypeCode" NOT NULL,
    "weight_kg" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "origin_name" TEXT NOT NULL,
    "origin_phone" TEXT NOT NULL,
    "origin_address_line1" TEXT NOT NULL,
    "origin_address_line2" TEXT,
    "origin_city" TEXT NOT NULL,
    "origin_state" TEXT NOT NULL,
    "origin_postal_code" TEXT NOT NULL,
    "origin_country" TEXT NOT NULL,
    "origin_instructions" TEXT,
    "dest_name" TEXT NOT NULL,
    "dest_phone" TEXT NOT NULL,
    "dest_address_line1" TEXT NOT NULL,
    "dest_address_line2" TEXT,
    "dest_city" TEXT NOT NULL,
    "dest_state" TEXT NOT NULL,
    "dest_postal_code" TEXT NOT NULL,
    "dest_country" TEXT NOT NULL,
    "fulfillment_method" "FulfillmentMethod" NOT NULL,
    "pickup_date" DATE,
    "pickup_time_slot" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "review_reason" "QuoteReviewReason",
    "internal_notes" TEXT,
    "quoted_amount" DECIMAL(10,2),
    "quoted_currency" TEXT DEFAULT 'INR',
    "quoted_by_admin_id" TEXT,
    "quoted_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "submission_key" TEXT NOT NULL,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickups" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "order_id" TEXT,
    "method" "FulfillmentMethod" NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_date" DATE,
    "scheduled_time_slot" TEXT,
    "assigned_staff_id" TEXT,
    "confirmed_by_admin_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "weight_verified_kg" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_submission_key_key" ON "quotes"("submission_key");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_order_id_key" ON "quotes"("order_id");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pickups_quote_id_key" ON "pickups"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickups_order_id_key" ON "pickups"("order_id");

-- CreateIndex
CREATE INDEX "pickups_status_idx" ON "pickups"("status");

-- CreateIndex
CREATE INDEX "pickups_scheduled_date_idx" ON "pickups"("scheduled_date");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_marked_by_admin_id_fkey" FOREIGN KEY ("payment_marked_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_quoted_by_admin_id_fkey" FOREIGN KEY ("quoted_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_confirmed_by_admin_id_fkey" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

