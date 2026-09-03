-- DropIndex
DROP INDEX "external_tracking_numbers_shipment_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "external_tracking_numbers_shipment_id_provider_id_key" ON "external_tracking_numbers"("shipment_id", "provider_id");

