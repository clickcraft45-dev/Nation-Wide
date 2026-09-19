-- B2B account requests from the public site.
--
-- Purely additive: one new table. A row grants nothing — approving it creates (or reuses) the
-- customer and issues their order link, and records which ones it produced. Reuses the existing
-- PartnerApplicationStatus enum: the review lifecycle is identical.

-- CreateTable
CREATE TABLE "b2b_requests" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "monthly_volume" TEXT,
    "message" TEXT,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_admin_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_customer_id" TEXT,
    "created_b2b_link_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "b2b_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b2b_requests_status_created_at_idx" ON "b2b_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "b2b_requests_email_idx" ON "b2b_requests"("email");

-- AddForeignKey
ALTER TABLE "b2b_requests" ADD CONSTRAINT "b2b_requests_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
