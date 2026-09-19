-- B2B becomes an account, not a public request.
--
-- customers.is_b2b marks a business: they sign in with their own customer account and land on the
-- B2B portal. An admin invites them by email; there is no self-service route in.
--
-- b2b_requests is dropped: the public "request an account" form it backed has been removed in
-- favour of the contact page, so nothing writes to it any more. It was deployed empty and stayed
-- empty (checked before this migration was written), so no data is lost.

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "is_b2b" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE IF EXISTS "b2b_requests";
