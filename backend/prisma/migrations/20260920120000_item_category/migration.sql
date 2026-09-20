-- Items carry the kind of goods as well as the specific item: "Garments" / "Saree".
--
-- Purely additive and nullable, so every item saved before this keeps working with no category.
-- Shipment contents themselves live in the quotes.items JSON column and need no migration.

-- AlterTable
ALTER TABLE "saved_items" ADD COLUMN "category" TEXT;
