-- The recipient (delivery) address becomes optional when a customer places a quote: they may
-- leave it for the pickup partner to take down and confirm at the door. Only the country stays
-- required — it is chosen first and drives pricing. Relaxing NOT NULL is safe on a populated
-- table; every existing row already has these values.
ALTER TABLE "quotes"
    ALTER COLUMN "dest_name" DROP NOT NULL,
    ALTER COLUMN "dest_phone" DROP NOT NULL,
    ALTER COLUMN "dest_address_line1" DROP NOT NULL,
    ALTER COLUMN "dest_city" DROP NOT NULL,
    ALTER COLUMN "dest_state" DROP NOT NULL,
    ALTER COLUMN "dest_postal_code" DROP NOT NULL;

-- When the partner confirmed (or took down) the recipient's address during verification.
ALTER TABLE "pickup_requests" ADD COLUMN "recipient_verified_at" TIMESTAMP(3);
