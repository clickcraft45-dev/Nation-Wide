-- CreateEnum
CREATE TYPE "RateCardScope" AS ENUM ('SINGLE_COUNTRY', 'ZONE');

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'NationWide',
    "logo_path" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#4F46E5',
    "website" TEXT,
    "support_email" TEXT,
    "support_phone" TEXT,
    "address" TEXT,
    "terms_and_conditions" TEXT,
    "footer_notes" TEXT,
    "insurance_disclaimer" TEXT,
    "legal_disclaimer" TEXT,
    "restricted_items_notice" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_card_documents" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "shipment_type" TEXT NOT NULL,
    "scope" "RateCardScope" NOT NULL,
    "zone_id" TEXT,
    "country_ids" TEXT[],
    "effective_date" DATE NOT NULL,
    "transit_time" TEXT,
    "template_key" TEXT NOT NULL DEFAULT 'CLASSIC',
    "version" INTEGER NOT NULL,
    "pdf" BYTEA NOT NULL,
    "pdf_size_bytes" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generated_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_card_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_card_documents_rate_provider_id_idx" ON "rate_card_documents"("rate_provider_id");

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_documents" ADD CONSTRAINT "rate_card_documents_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_documents" ADD CONSTRAINT "rate_card_documents_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_documents" ADD CONSTRAINT "rate_card_documents_generated_by_admin_id_fkey" FOREIGN KEY ("generated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
