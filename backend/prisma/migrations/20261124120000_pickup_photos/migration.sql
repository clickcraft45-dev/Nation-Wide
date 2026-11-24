-- Several labelled photos per identity document and per parcel, replacing the single Aadhaar
-- photo on the customer and the single parcel photo on the pickup. The existing photos are
-- carried over before the old columns go, so nothing on file is lost.

CREATE TYPE "PickupPhotoKind" AS ENUM ('KYC', 'PARCEL');

CREATE TABLE "pickup_photos" (
    "id" TEXT NOT NULL,
    "kind" "PickupPhotoKind" NOT NULL,
    "customer_id" TEXT NOT NULL,
    "pickup_request_id" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pickup_photos_customer_id_kind_idx" ON "pickup_photos"("customer_id", "kind");
CREATE INDEX "pickup_photos_pickup_request_id_kind_idx" ON "pickup_photos"("pickup_request_id", "kind");

ALTER TABLE "pickup_photos" ADD CONSTRAINT "pickup_photos_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pickup_photos" ADD CONSTRAINT "pickup_photos_pickup_request_id_fkey"
    FOREIGN KEY ("pickup_request_id") REFERENCES "pickup_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers" ADD COLUMN "kyc_document_type" TEXT;
ALTER TABLE "customers" ADD COLUMN "kyc_document_number" TEXT;

-- Carry the old single photos over. Size is unknown for these (0): it is informational only.
INSERT INTO "pickup_photos" ("id", "kind", "customer_id", "key", "label", "size_bytes", "created_at")
SELECT gen_random_uuid()::text, 'KYC', "id", "aadhaar_key", 'Aadhaar', 0, COALESCE("aadhaar_uploaded_at", CURRENT_TIMESTAMP)
FROM "customers" WHERE "aadhaar_key" IS NOT NULL;

UPDATE "customers" SET "kyc_document_type" = 'AADHAAR' WHERE "aadhaar_key" IS NOT NULL;

INSERT INTO "pickup_photos" ("id", "kind", "customer_id", "pickup_request_id", "key", "label", "size_bytes", "created_at")
SELECT gen_random_uuid()::text, 'PARCEL', "customer_id", "id", "parcel_photo_key", 'Parcel', 0, "updated_at"
FROM "pickup_requests" WHERE "parcel_photo_key" IS NOT NULL;

ALTER TABLE "customers" DROP COLUMN "aadhaar_key";
ALTER TABLE "customers" DROP COLUMN "aadhaar_uploaded_at";
ALTER TABLE "pickup_requests" DROP COLUMN "parcel_photo_key";
