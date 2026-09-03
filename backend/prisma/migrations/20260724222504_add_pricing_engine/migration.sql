-- CreateEnum
CREATE TYPE "RateCardStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "QuoteReviewReason" ADD VALUE 'NO_RATE_AVAILABLE';

-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'RATED';

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "options_expire_at" TIMESTAMP(3),
ADD COLUMN     "selected_option_id" TEXT;

-- CreateTable
CREATE TABLE "rate_providers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RateCardStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_until" TIMESTAMP(3),
    "created_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_slabs" (
    "id" TEXT NOT NULL,
    "rate_card_id" TEXT NOT NULL,
    "weight_from_kg" DECIMAL(10,2) NOT NULL,
    "weight_to_kg" DECIMAL(10,2) NOT NULL,
    "base_rate" DECIMAL(10,2) NOT NULL,
    "pss_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fuel_charge_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gst_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "nationwide_cut" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weight_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_quote_options" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "rate_card_id" TEXT NOT NULL,
    "weight_slab_id" TEXT NOT NULL,
    "rate_card_version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "base_rate" DECIMAL(10,2) NOT NULL,
    "pss_amount" DECIMAL(10,2) NOT NULL,
    "fuel_charge_percent" DECIMAL(5,2) NOT NULL,
    "fuel_charge_amount" DECIMAL(10,2) NOT NULL,
    "taxable_subtotal" DECIMAL(10,2) NOT NULL,
    "gst_percent" DECIMAL(5,2) NOT NULL,
    "gst_amount" DECIMAL(10,2) NOT NULL,
    "nationwide_cut" DECIMAL(10,2) NOT NULL,
    "final_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_quote_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_providers_code_key" ON "rate_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE INDEX "rate_cards_rate_provider_id_country_id_status_idx" ON "rate_cards"("rate_provider_id", "country_id", "status");

-- CreateIndex
CREATE INDEX "weight_slabs_rate_card_id_idx" ON "weight_slabs"("rate_card_id");

-- CreateIndex
CREATE INDEX "rate_quote_options_quote_id_idx" ON "rate_quote_options"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_selected_option_id_key" ON "quotes"("selected_option_id");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "rate_quote_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_slabs" ADD CONSTRAINT "weight_slabs_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_weight_slab_id_fkey" FOREIGN KEY ("weight_slab_id") REFERENCES "weight_slabs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

