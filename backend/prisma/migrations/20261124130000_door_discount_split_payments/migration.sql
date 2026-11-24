-- A discount the pickup partner gives at the door (admin-approved), payments split across
-- methods (cash + UPI), and receipts issued at the door before the order exists.

ALTER TABLE "pickup_requests" ADD COLUMN "payment_splits" JSONB;
ALTER TABLE "pickup_requests" ADD COLUMN "door_discount_amount" DOUBLE PRECISION;
ALTER TABLE "pickup_requests" ADD COLUMN "door_discount_reason" TEXT;
ALTER TABLE "pickup_requests" ADD COLUMN "door_discount_approved_by_admin_id" TEXT;
ALTER TABLE "pickup_requests" ADD COLUMN "door_discount_at" TIMESTAMP(3);

ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_door_discount_approved_by_admin_id_fkey"
    FOREIGN KEY ("door_discount_approved_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts" ADD COLUMN "payment_splits" JSONB;
ALTER TABLE "receipts" ADD COLUMN "pickup_request_id" TEXT;
CREATE INDEX "receipts_pickup_request_id_idx" ON "receipts"("pickup_request_id");
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_pickup_request_id_fkey"
    FOREIGN KEY ("pickup_request_id") REFERENCES "pickup_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
