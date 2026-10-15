-- Rates imported from an "all-in" sheet already include fuel, surcharges and GST.
ALTER TABLE "rate_cards" ADD COLUMN "tax_inclusive" BOOLEAN NOT NULL DEFAULT false;
