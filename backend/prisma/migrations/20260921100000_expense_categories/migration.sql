-- Expense headings become rows an admin owns, with one level of subcategory.
--
-- The twelve enum values are carried over as top-level categories so nothing already recorded
-- loses its heading, and every existing expense is re-pointed at the matching row before the old
-- column and type are dropped. Names are the labels the UI was already showing, not the SHOUTING
-- codes.

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_categories_parent_id_idx" ON "expense_categories"("parent_id");

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the headings that already existed, keeping their ids stable and derivable.
INSERT INTO "expense_categories" ("id", "name", "updated_at") VALUES
    ('00000000-0000-4000-8000-000000000001', 'Salary', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000002', 'Rent', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000003', 'Utilities', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000004', 'Fuel', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000005', 'Packaging', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000006', 'Courier Partner', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000007', 'Marketing', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000008', 'Office Supplies', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000009', 'Travel', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-00000000000a', 'Maintenance', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-00000000000b', 'Taxes & Fees', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-00000000000c', 'Other', CURRENT_TIMESTAMP);

-- Re-point every recorded expense at its heading.
ALTER TABLE "expenses" ADD COLUMN "category_id" TEXT;

UPDATE "expenses" SET "category_id" = CASE "category"::text
    WHEN 'SALARY'          THEN '00000000-0000-4000-8000-000000000001'
    WHEN 'RENT'            THEN '00000000-0000-4000-8000-000000000002'
    WHEN 'UTILITIES'       THEN '00000000-0000-4000-8000-000000000003'
    WHEN 'FUEL'            THEN '00000000-0000-4000-8000-000000000004'
    WHEN 'PACKAGING'       THEN '00000000-0000-4000-8000-000000000005'
    WHEN 'COURIER_PARTNER' THEN '00000000-0000-4000-8000-000000000006'
    WHEN 'MARKETING'       THEN '00000000-0000-4000-8000-000000000007'
    WHEN 'OFFICE_SUPPLIES' THEN '00000000-0000-4000-8000-000000000008'
    WHEN 'TRAVEL'          THEN '00000000-0000-4000-8000-000000000009'
    WHEN 'MAINTENANCE'     THEN '00000000-0000-4000-8000-00000000000a'
    WHEN 'TAXES_FEES'      THEN '00000000-0000-4000-8000-00000000000b'
    ELSE '00000000-0000-4000-8000-00000000000c'
END;

ALTER TABLE "expenses" ALTER COLUMN "category_id" SET NOT NULL;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- The old heading is now carried by the row it points at.
DROP INDEX IF EXISTS "expenses_category_idx";
ALTER TABLE "expenses" DROP COLUMN "category";
DROP TYPE "ExpenseCategory";
