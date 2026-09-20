-- STAFF is retired and SUPER_ADMIN takes its place at the top of the ladder.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt and the column cast across.
-- Every existing STAFF account becomes an ADMIN: that was the role they were doing in practice,
-- and leaving them unmapped would lock them out of the admin panel entirely.
--
-- No account is promoted to SUPER_ADMIN here. Promote one deliberately afterwards:
--   UPDATE "admin_users" SET "role" = 'SUPER_ADMIN' WHERE "email" = 'you@example.com';

-- CreateEnum (the replacement type)
CREATE TYPE "AdminRole_new" AS ENUM ('CUSTOMER', 'ADMIN', 'SUPER_ADMIN', 'PICKUP_PARTNER');

-- AlterTable
ALTER TABLE "admin_users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "admin_users"
    ALTER COLUMN "role" TYPE "AdminRole_new"
    USING (CASE WHEN "role"::text = 'STAFF' THEN 'ADMIN' ELSE "role"::text END)::"AdminRole_new";
ALTER TABLE "admin_users" ALTER COLUMN "role" SET DEFAULT 'ADMIN';

-- Swap the types over
ALTER TYPE "AdminRole" RENAME TO "AdminRole_old";
ALTER TYPE "AdminRole_new" RENAME TO "AdminRole";
DROP TYPE "AdminRole_old";
