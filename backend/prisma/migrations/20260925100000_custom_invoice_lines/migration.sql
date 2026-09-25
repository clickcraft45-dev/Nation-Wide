-- The freight schedule behind a custom invoice.
--
-- A one-off invoice could only ever say one thing on one line. The office bills from a shipment
-- schedule — a row per AWB with destination, weight, and the freight/GMR/PSS/FSC split — and was
-- retyping that into a single description with one total. The rows are stored as JSON alongside
-- the invoice because they are frozen evidence of what the tax was computed on, not live data.
ALTER TABLE "invoices" ADD COLUMN "custom_lines" JSONB;
