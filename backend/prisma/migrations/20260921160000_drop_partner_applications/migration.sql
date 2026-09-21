-- Drops the pickup-partner application queue.
--
-- The public sign-up form it fed was removed earlier; the queue stayed only so applications
-- submitted before that change could be closed out. Production holds zero rows (checked before
-- writing this), and admins now create partner accounts directly, so nothing reads this table.

DROP TABLE IF EXISTS "partner_applications";
DROP TYPE IF EXISTS "PartnerApplicationStatus";
