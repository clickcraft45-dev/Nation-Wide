-- The last few changes to each carrier's fuel surcharge.
--
-- Purely additive. Rows are pruned to the most recent five per carrier on every write (see
-- FuelSurchargeService.prune): the surcharge moves weekly, and the question anyone asks is only
-- ever about the recent past.

-- CreateTable
CREATE TABLE "fuel_surcharge_updates" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "previous_percent" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "label" TEXT,
    "applied_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_surcharge_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fuel_surcharge_updates_rate_provider_id_created_at_idx"
    ON "fuel_surcharge_updates"("rate_provider_id", "created_at");

ALTER TABLE "fuel_surcharge_updates" ADD CONSTRAINT "fuel_surcharge_updates_rate_provider_id_fkey"
    FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fuel_surcharge_updates" ADD CONSTRAINT "fuel_surcharge_updates_applied_by_admin_id_fkey"
    FOREIGN KEY ("applied_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
