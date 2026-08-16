-- DropForeignKey
ALTER TABLE "rate_card_documents" DROP CONSTRAINT "rate_card_documents_zone_id_fkey";

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "tagline" TEXT;

-- AlterTable
ALTER TABLE "rate_card_documents" DROP COLUMN "scope",
DROP COLUMN "transit_time",
DROP COLUMN "zone_id";

-- DropEnum
DROP TYPE "RateCardScope";

