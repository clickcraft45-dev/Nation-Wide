-- B2B order-request links: a standing link a business customer's staff use to book shipments
-- without individual logins.
--
-- Purely additive: one new table. token_hash is a SHA-256 of the link token, never the token, and
-- is UNIQUE so a lookup is a single indexed read. Rows cascade with the customer.

-- CreateTable
CREATE TABLE "b2b_links" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by_admin_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b2b_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "b2b_links_token_hash_key" ON "b2b_links"("token_hash");

-- CreateIndex
CREATE INDEX "b2b_links_customer_id_idx" ON "b2b_links"("customer_id");

-- AddForeignKey
ALTER TABLE "b2b_links" ADD CONSTRAINT "b2b_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_links" ADD CONSTRAINT "b2b_links_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
