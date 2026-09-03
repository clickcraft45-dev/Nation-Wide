-- An invoice no longer has to bill an order. Admins raise one-off invoices (a re-delivery fee, a
-- packaging charge, a correction) that have no order behind them; those carry a free-text line
-- description instead. order_id stays UNIQUE, so an order still cannot be invoiced twice —
-- Postgres allows many NULLs in a unique column, which is exactly the behaviour wanted here.
ALTER TABLE "invoices" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "custom_line_description" TEXT;
