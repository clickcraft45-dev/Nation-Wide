-- The admin's list of recurring items, offered wherever shipment contents are typed.
CREATE TABLE "item_catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "hs_code" TEXT,
    "default_unit_value" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_catalog_pkey" PRIMARY KEY ("id")
);

-- One entry per item, whatever the capitalisation: "Saree" and "saree" are the same thing.
CREATE UNIQUE INDEX "item_catalog_name_lower_key" ON "item_catalog"(LOWER("name"));
