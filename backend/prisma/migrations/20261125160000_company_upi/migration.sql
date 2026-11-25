-- Where customers pay by UPI: the partner app and warehouse counter draw the payment QR from it.
ALTER TABLE "company_settings" ADD COLUMN "upi_id" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "upi_payee_name" TEXT;

-- The collection account on the counter's YES Bank QR (25 Nov 2026). Only the active template,
-- and only if nobody has set one yet. Admin changes it on the Payments page.
UPDATE "company_settings"
SET "upi_id" = 'yespay.mabs0488619ikit1322@yesbankltd',
    "upi_payee_name" = 'GLOBAL LOGISTICS SOLUTIONS'
WHERE "is_active" = true AND "upi_id" IS NULL;
