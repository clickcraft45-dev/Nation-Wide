-- A coupon applied by the customer when they book, rather than only by an admin at payment.
--
-- It has to live on the pickup request, not just the order: the order does not exist until the
-- partner accepts the parcel, but the discount has to be visible on the quote the customer
-- agreed to and in the amount the partner collects at the door. It is copied onto the order at
-- acceptance, where the existing orders.coupon_id/discount_amount take over as the billing record.
--
-- discount_amount is frozen here for the same reason it is on orders: a coupon can be retired or
-- re-priced between booking and collection, and the customer was promised this figure.

ALTER TABLE "pickup_requests" ADD COLUMN "coupon_id" TEXT;
ALTER TABLE "pickup_requests" ADD COLUMN "discount_amount" DOUBLE PRECISION;

ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_coupon_id_fkey"
    FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
