-- The vendor's own bill, attached to the expense it belongs to.
--
-- The ledger recorded a reference number and nothing else, so proving an expense meant finding
-- the paper. The file lives in S3 like every other document; only its key is stored here.
ALTER TABLE "expenses" ADD COLUMN "receipt_key" TEXT;
ALTER TABLE "expenses" ADD COLUMN "receipt_name" TEXT;
