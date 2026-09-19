-- Admin-booked orders, shipment contents, box dimensions, and pickup KYC.
--
-- Purely additive: nullable columns and one new table. Safe on a populated database.
--
-- quotes.packages / quotes.items: the boxes (with dimensions, for volumetric weight) and the
-- declared contents carriers ask for. pickup_requests.verified_packages: the boxes as measured at
-- the door. parcel_photo_key / customers.aadhaar_key: S3 keys of the photos taken at pickup.
-- admin_users.last_*: a pickup partner's last known position, for manual assignment.

-- AlterTable
ALTER TABLE "customers"
    ADD COLUMN "aadhaar_key" TEXT,
    ADD COLUMN "aadhaar_uploaded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quotes"
    ADD COLUMN "packages" JSONB,
    ADD COLUMN "items" JSONB;

-- AlterTable
ALTER TABLE "pickup_requests"
    ADD COLUMN "pickup_maps_url" TEXT,
    ADD COLUMN "verified_packages" JSONB,
    ADD COLUMN "parcel_photo_key" TEXT;

-- AlterTable
ALTER TABLE "admin_users"
    ADD COLUMN "last_latitude" DOUBLE PRECISION,
    ADD COLUMN "last_longitude" DOUBLE PRECISION,
    ADD COLUMN "location_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "saved_items" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hs_code" TEXT,
    "unit_value" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_items_customer_id_description_key" ON "saved_items"("customer_id", "description");

-- AddForeignKey
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
