-- A coupon discount shown on the invoice as a deduction AFTER tax.
--
-- Deliberately post-tax: the taxable value and the CGST/SGST/IGST on it stay exactly what the
-- supply was worth, and the discount comes off the payable total underneath. That keeps the tax
-- figures reconcilable against the rate card, at the cost of the discount not reducing output
-- tax — which is the treatment chosen for this business.
--
-- Frozen onto the invoice rather than read back through the order: a coupon can be retired or
-- re-priced afterwards, and a tax document must still say what it said the day it was issued.

ALTER TABLE "invoices" ADD COLUMN "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "discount_code" TEXT;
