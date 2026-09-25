-- Discount coupons, and parcels taken on a "pay later" approval.
--
-- Coupons are flat rupees off a code an admin creates; the amount is copied onto the order it
-- discounts because a coupon can be retired or re-priced afterwards.
--
-- A pickup partner could only ever accept a parcel with money in hand. The door reality is that
-- an admin sometimes waves one through unpaid, so the deferral is recorded with the admin who
-- approved it and the amount is carried onto the order as a due the customer can see.

CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discount_amount" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "max_redemptions" INTEGER,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "coupon_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "discount_amount" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "due_amount" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "due_approved_by_admin_id" TEXT;

ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey"
    FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_due_approved_by_admin_id_fkey"
    FOREIGN KEY ("due_approved_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pickup_requests" ADD COLUMN "payment_deferred_at" TIMESTAMP(3);
ALTER TABLE "pickup_requests" ADD COLUMN "payment_due_approved_by_admin_id" TEXT;
ALTER TABLE "pickup_requests" ADD COLUMN "payment_due_note" TEXT;

ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_payment_due_approved_by_admin_id_fkey"
    FOREIGN KEY ("payment_due_approved_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
