-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "provider_message_id" TEXT,
ADD COLUMN     "read_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_provider_message_id_key" ON "notifications"("provider_message_id");

