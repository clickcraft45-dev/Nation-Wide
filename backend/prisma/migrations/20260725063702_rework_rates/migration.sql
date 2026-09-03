-- DropIndex
DROP INDEX "rate_cards_rate_provider_id_country_id_status_idx";

-- AlterTable
ALTER TABLE "rate_cards" DROP COLUMN "effective_from",
DROP COLUMN "effective_until",
DROP COLUMN "status",
DROP COLUMN "version";

-- AlterTable
ALTER TABLE "rate_quote_options" DROP COLUMN "rate_card_version";

-- AlterTable
ALTER TABLE "weight_slabs" ADD COLUMN     "created_by_admin_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_by_admin_id" TEXT;

-- DropEnum
DROP TYPE "RateCardStatus";

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_rate_provider_id_country_id_key" ON "rate_cards"("rate_provider_id", "country_id");

-- AddForeignKey
ALTER TABLE "weight_slabs" ADD CONSTRAINT "weight_slabs_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_slabs" ADD CONSTRAINT "weight_slabs_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

