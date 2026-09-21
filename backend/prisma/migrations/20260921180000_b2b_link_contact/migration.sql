-- Who at the business holds a given link.
--
-- On the link rather than the customer: a business may hold several links, and revoking one is a
-- decision about a person ("Priya has left") rather than about the account.

ALTER TABLE "b2b_links" ADD COLUMN "contact_name" TEXT;
