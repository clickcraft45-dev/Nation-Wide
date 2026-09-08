-- Post-delivery customer feedback.
--
-- Purely additive: one new table, nothing existing altered. Safe on a populated database.
--
-- The review text lives here rather than in S3 (docs/STORAGE_POLICY.md): it is structured data
-- that has to be queried, moderated and averaged. Only an attached photo becomes an S3 object,
-- and then photo_key holds its key.
--
-- token_hash stores a SHA-256 of the single-use link token, never the token itself, so a leak of
-- this table cannot be used to post as a customer. shipment_id is UNIQUE, which makes "one
-- review per shipment" a database guarantee rather than application etiquette.

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "photo_key" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by_admin_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_shipment_id_key" ON "reviews"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_token_hash_key" ON "reviews"("token_hash");

-- CreateIndex
CREATE INDEX "reviews_approved_submitted_at_idx" ON "reviews"("approved", "submitted_at");

-- CreateIndex
CREATE INDEX "reviews_customer_id_idx" ON "reviews"("customer_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
