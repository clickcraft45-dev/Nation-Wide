-- Phone (Web Push) notifications, and the exact pickup location.
--
-- Purely additive: one new table and two nullable columns. Safe on a populated database.
--
-- push_subscriptions holds one row per browser or phone that agreed to receive notifications,
-- owned by either a customer or an admin_users row (staff or pickup partner) — exactly one of
-- the two is set. endpoint is UNIQUE so a device subscribing again replaces its row instead of
-- adding a duplicate that would deliver every notification twice. Rows cascade with their owner:
-- a deleted account's devices must stop receiving anything.
--
-- pickup_latitude / pickup_longitude are where the customer dropped the pin (or the searched
-- address resolved to), so the partner navigates to the door, not the middle of a PIN code.
-- Null for every existing row and for any address typed without the map.

-- AlterTable
ALTER TABLE "pickup_requests"
    ADD COLUMN "pickup_latitude" DOUBLE PRECISION,
    ADD COLUMN "pickup_longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "customer_id" TEXT,
    "admin_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_customer_id_idx" ON "push_subscriptions"("customer_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_admin_user_id_idx" ON "push_subscriptions"("admin_user_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
