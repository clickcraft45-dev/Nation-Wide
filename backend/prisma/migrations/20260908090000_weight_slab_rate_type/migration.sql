-- Per-kilogram weight slabs.
--
-- Carrier tariffs price heavy freight by the kilo (FedEx bills 21-44 kg at Rs.444/kg), which a
-- flat baseRate cannot express — stored flat, a 40 kg parcel would be sold for about 2.5% of its
-- cost. RateType.PER_KG makes the pricing engine multiply baseRate by the chargeable weight.
--
-- Purely additive and backwards-compatible: the column is NOT NULL with DEFAULT 'FLAT', so every
-- existing slab keeps behaving exactly as it did and no backfill is required.

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('FLAT', 'PER_KG');

-- AlterTable
ALTER TABLE "weight_slabs" ADD COLUMN     "rate_type" "RateType" NOT NULL DEFAULT 'FLAT';
