-- The daily DHL check applies the published surcharge with nobody signed in: no admin to record.
ALTER TABLE "fuel_surcharge_updates" ALTER COLUMN "applied_by_admin_id" DROP NOT NULL;
