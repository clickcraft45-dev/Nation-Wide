-- Whether a cancelled parcel came back.
--
-- Cancellation recorded the money (refundedAt) but never the goods, so "cancelled and refunded,
-- parcel still in our warehouse" and "cancelled, refunded, parcel handed back" were the same row.
-- Staff chasing returns had nothing to filter on.
ALTER TABLE "orders" ADD COLUMN "returned_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "return_note" TEXT;
