-- Carrier remote / out-of-delivery-area listings.
--
-- Purely additive: one new table, nothing existing altered. Safe on a populated database.
--
-- Holds the ~170,000 postcode-range rows the carriers publish alongside their tariffs (UPS's
-- Extended Area Surcharge lists, FedEx's Out-of-Delivery-Area tiers, DPD's zip ranges). There was
-- previously nowhere to put any of it.
--
-- Postal codes are TEXT, not integers: Canadian FSAs ("L0A"), UK outcodes and leading-zero codes
-- ("0800") are not numbers, and comparing them numerically turns a leading zero into a different
-- area entirely.
--
-- country_id is nullable on purpose — a carrier's printed country name does not always match a
-- known country, and country_name always keeps the original spelling so a later re-match stays
-- possible. The FK is ON DELETE SET NULL for the same reason: losing a country row must not
-- delete the surcharge history.

-- CreateTable
CREATE TABLE "remote_areas" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "country_id" TEXT,
    "country_name" TEXT NOT NULL,
    "city" TEXT,
    "postal_code_from" TEXT,
    "postal_code_to" TEXT,
    "surcharge_label" TEXT,
    "surcharge_amount" DOUBLE PRECISION,
    "origin_surcharge" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remote_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remote_areas_rate_provider_id_country_id_idx" ON "remote_areas"("rate_provider_id", "country_id");

-- CreateIndex
CREATE INDEX "remote_areas_rate_provider_id_country_name_idx" ON "remote_areas"("rate_provider_id", "country_name");

-- CreateIndex
CREATE INDEX "remote_areas_source_idx" ON "remote_areas"("source");

-- AddForeignKey
ALTER TABLE "remote_areas" ADD CONSTRAINT "remote_areas_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_areas" ADD CONSTRAINT "remote_areas_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
