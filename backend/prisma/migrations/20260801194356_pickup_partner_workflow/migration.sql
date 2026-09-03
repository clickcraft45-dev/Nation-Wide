-- CreateEnum
CREATE TYPE "PickupRequestStatus" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'SCHEDULED', 'OUT_FOR_PICKUP', 'VERIFICATION_PENDING', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'PICKUP_PARTNER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuoteStatus" ADD VALUE 'PENDING_PICKUP_REQUEST';
ALTER TYPE "QuoteStatus" ADD VALUE 'PICKUP_REQUESTED';

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "name" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "quotes" ALTER COLUMN "origin_name" DROP NOT NULL,
ALTER COLUMN "origin_phone" DROP NOT NULL,
ALTER COLUMN "origin_address_line1" DROP NOT NULL,
ALTER COLUMN "origin_city" DROP NOT NULL,
ALTER COLUMN "origin_state" DROP NOT NULL,
ALTER COLUMN "origin_postal_code" DROP NOT NULL,
ALTER COLUMN "origin_country" DROP NOT NULL,
ALTER COLUMN "fulfillment_method" DROP NOT NULL;

-- CreateTable
CREATE TABLE "pickup_requests" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "rate_provider_name" TEXT NOT NULL,
    "shipment_type" "ShipmentTypeCode" NOT NULL,
    "estimated_weight_kg" DECIMAL(10,2) NOT NULL,
    "estimated_price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "drop_at_warehouse" BOOLEAN NOT NULL DEFAULT false,
    "pickup_contact_name" TEXT NOT NULL,
    "pickup_contact_phone" TEXT NOT NULL,
    "pickup_address_line1" TEXT NOT NULL,
    "pickup_address_line2" TEXT,
    "pickup_city" TEXT NOT NULL,
    "pickup_state" TEXT NOT NULL,
    "pickup_postal_code" TEXT NOT NULL,
    "pickup_date" DATE,
    "pickup_time_slot" TEXT,
    "pickup_instructions" TEXT,
    "status" "PickupRequestStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    "assigned_partner_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "verified_weight_kg" DECIMAL(10,2),
    "verified_shipment_type" "ShipmentTypeCode",
    "verified_price" DECIMAL(10,2),
    "verification_notes" TEXT,
    "verified_at" TIMESTAMP(3),
    "payment_method" "PaymentMethod",
    "collected_amount" DECIMAL(10,2),
    "payment_reference" TEXT,
    "payment_notes" TEXT,
    "payment_collected_at" TIMESTAMP(3),
    "parcel_packed_properly" BOOLEAN,
    "weight_verified_flag" BOOLEAN,
    "restricted_items_checked" BOOLEAN,
    "documents_verified" BOOLEAN,
    "is_fragile" BOOLEAN,
    "insurance_required" BOOLEAN,
    "acceptance_remarks" TEXT,
    "rejection_reason" TEXT,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pickup_requests_quote_id_key" ON "pickup_requests"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_requests_order_id_key" ON "pickup_requests"("order_id");

-- CreateIndex
CREATE INDEX "pickup_requests_customer_id_idx" ON "pickup_requests"("customer_id");

-- CreateIndex
CREATE INDEX "pickup_requests_status_idx" ON "pickup_requests"("status");

-- CreateIndex
CREATE INDEX "pickup_requests_assigned_partner_id_idx" ON "pickup_requests"("assigned_partner_id");

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_assigned_partner_id_fkey" FOREIGN KEY ("assigned_partner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

