-- AlterTable
ALTER TABLE "pickup_requests" ALTER COLUMN "rate_provider_id" DROP NOT NULL,
ALTER COLUMN "rate_provider_name" DROP NOT NULL;
