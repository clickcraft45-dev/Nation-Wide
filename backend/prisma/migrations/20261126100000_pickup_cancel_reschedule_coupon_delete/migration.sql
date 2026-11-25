-- Staff cancel a pickup from Pickup Assignments; the partner accepts an assigned pickup or asks
-- for another day first.
ALTER TABLE "pickup_requests" ADD COLUMN "accepted_at" TIMESTAMP(3);
ALTER TABLE "pickup_requests" ADD COLUMN "rescheduled_at" TIMESTAMP(3);
ALTER TABLE "pickup_requests" ADD COLUMN "reschedule_reason" TEXT;
ALTER TABLE "pickup_requests" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "pickup_requests" ADD COLUMN "cancellation_reason" TEXT;

-- A coupon that was used is hidden rather than removed, so the bookings it discounted keep it.
ALTER TABLE "coupons" ADD COLUMN "deleted_at" TIMESTAMP(3);
