-- DropForeignKey
ALTER TABLE "rate_cards" DROP CONSTRAINT "rate_cards_country_id_fkey";

-- DropForeignKey
ALTER TABLE "rate_cards" DROP CONSTRAINT "rate_cards_rate_provider_id_fkey";

-- DropIndex
DROP INDEX "rate_cards_rate_provider_id_country_id_key";

-- AlterTable
ALTER TABLE "rate_cards" DROP COLUMN "country_id",
DROP COLUMN "rate_provider_id",
ADD COLUMN     "shipment_type" TEXT NOT NULL,
ADD COLUMN     "zone_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_countries" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,

    CONSTRAINT "zone_countries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zones_rate_provider_id_name_key" ON "zones"("rate_provider_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "zone_countries_rate_provider_id_country_id_key" ON "zone_countries"("rate_provider_id", "country_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_zone_id_shipment_type_key" ON "rate_cards"("zone_id", "shipment_type");

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_countries" ADD CONSTRAINT "zone_countries_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_countries" ADD CONSTRAINT "zone_countries_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_countries" ADD CONSTRAINT "zone_countries_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

