-- AlterTable
ALTER TABLE "rate_providers" ADD COLUMN     "fuel_charge_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pss_per_kg" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "weight_slabs" DROP COLUMN "fuel_charge_percent",
DROP COLUMN "pss_amount";
