-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "sequence_number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "shipments_sequence_number_key" ON "shipments"("sequence_number");

