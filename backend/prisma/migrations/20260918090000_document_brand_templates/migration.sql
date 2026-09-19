-- Document brand templates: the single company_settings row becomes one of several named
-- templates, exactly one of which is active.
--
-- Purely additive. The existing row gets name "Default" and becomes the active template, so every
-- invoice, receipt and rate card keeps rendering exactly as before.

-- AlterTable
ALTER TABLE "company_settings"
    ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Default',
    ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
