-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN', 'PICKUP_PARTNER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'SMS', 'VOICE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "ShipmentTypeCode" AS ENUM ('DOCUMENT', 'PARCEL', 'PACKAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'WAREHOUSE_DROP_OFF');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SUBMITTED', 'RATED', 'NEEDS_MANUAL_REVIEW', 'QUOTED', 'PENDING_PICKUP_REQUEST', 'PICKUP_REQUESTED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteReviewReason" AS ENUM ('OVERSIZED', 'DANGEROUS_GOODS', 'RESTRICTED_DESTINATION', 'SPECIAL_HANDLING', 'MISCELLANEOUS', 'NO_RATE_AVAILABLE');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('SCHEDULED', 'PENDING', 'ASSIGNED', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'CANCELLED', 'PICKUP_FAILED', 'DROPPED_OFF');

-- CreateEnum
CREATE TYPE "PickupRequestStatus" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'SCHEDULED', 'OUT_FOR_PICKUP', 'VERIFICATION_PENDING', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'RAZORPAY');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "password_hash" TEXT,
    "hashed_refresh_token" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "consent_given_at" TIMESTAMP(3) NOT NULL,
    "consent_source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" "PaymentMethod",
    "paid_amount" DOUBLE PRECISION,
    "paid_at" TIMESTAMP(3),
    "payment_marked_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "shipment_type" "ShipmentTypeCode" NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "origin_name" TEXT,
    "origin_phone" TEXT,
    "origin_address_line1" TEXT,
    "origin_address_line2" TEXT,
    "origin_city" TEXT,
    "origin_state" TEXT,
    "origin_postal_code" TEXT,
    "origin_country" TEXT,
    "origin_instructions" TEXT,
    "dest_name" TEXT NOT NULL,
    "dest_phone" TEXT NOT NULL,
    "dest_address_line1" TEXT NOT NULL,
    "dest_address_line2" TEXT,
    "dest_city" TEXT NOT NULL,
    "dest_state" TEXT NOT NULL,
    "dest_postal_code" TEXT NOT NULL,
    "dest_country" TEXT NOT NULL,
    "fulfillment_method" "FulfillmentMethod",
    "pickup_date" TIMESTAMP(3),
    "pickup_time_slot" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "review_reason" "QuoteReviewReason",
    "internal_notes" TEXT,
    "quoted_amount" DOUBLE PRECISION,
    "quoted_currency" TEXT DEFAULT 'INR',
    "quoted_by_admin_id" TEXT,
    "quoted_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "submission_key" TEXT NOT NULL,
    "order_id" TEXT,
    "selected_option_id" TEXT,
    "options_expire_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickups" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "order_id" TEXT,
    "method" "FulfillmentMethod" NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_date" TIMESTAMP(3),
    "scheduled_time_slot" TEXT,
    "assigned_staff_id" TEXT,
    "confirmed_by_admin_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "weight_verified_kg" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_requests" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "rate_provider_id" TEXT,
    "rate_provider_name" TEXT,
    "shipment_type" "ShipmentTypeCode" NOT NULL,
    "estimated_weight_kg" DOUBLE PRECISION NOT NULL,
    "estimated_price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "drop_at_warehouse" BOOLEAN NOT NULL DEFAULT false,
    "pickup_contact_name" TEXT NOT NULL,
    "pickup_contact_phone" TEXT NOT NULL,
    "pickup_address_line1" TEXT NOT NULL,
    "pickup_address_line2" TEXT,
    "pickup_city" TEXT NOT NULL,
    "pickup_state" TEXT NOT NULL,
    "pickup_postal_code" TEXT NOT NULL,
    "pickup_date" TIMESTAMP(3),
    "pickup_time_slot" TEXT,
    "pickup_instructions" TEXT,
    "status" "PickupRequestStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    "assigned_partner_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "verified_weight_kg" DOUBLE PRECISION,
    "verified_shipment_type" "ShipmentTypeCode",
    "verified_price" DOUBLE PRECISION,
    "verified_taxable_subtotal" DOUBLE PRECISION,
    "verified_gst_percent" DOUBLE PRECISION,
    "verified_gst_amount" DOUBLE PRECISION,
    "verified_nationwide_cut" DOUBLE PRECISION,
    "verification_notes" TEXT,
    "verified_at" TIMESTAMP(3),
    "payment_method" "PaymentMethod",
    "collected_amount" DOUBLE PRECISION,
    "payment_reference" TEXT,
    "payment_notes" TEXT,
    "payment_collected_at" TIMESTAMP(3),
    "parcel_packed_properly" BOOLEAN,
    "weight_verified_flag" BOOLEAN,
    "restricted_items_checked" BOOLEAN,
    "documents_verified" BOOLEAN,
    "is_fragile" BOOLEAN,
    "insurance_required" BOOLEAN,
    "acceptance_remarks" TEXT,
    "rejection_reason" TEXT,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_providers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "fuel_charge_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pss_per_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_countries" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,

    CONSTRAINT "zone_countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "shipment_type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "created_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_slabs" (
    "id" TEXT NOT NULL,
    "rate_card_id" TEXT NOT NULL,
    "weight_from_kg" DOUBLE PRECISION NOT NULL,
    "weight_to_kg" DOUBLE PRECISION NOT NULL,
    "base_rate" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nationwide_cut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_admin_id" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weight_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_quote_options" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "rate_card_id" TEXT NOT NULL,
    "weight_slab_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "base_rate" DOUBLE PRECISION NOT NULL,
    "pss_amount" DOUBLE PRECISION NOT NULL,
    "fuel_charge_percent" DOUBLE PRECISION NOT NULL,
    "fuel_charge_amount" DOUBLE PRECISION NOT NULL,
    "taxable_subtotal" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "gst_amount" DOUBLE PRECISION NOT NULL,
    "nationwide_cut" DOUBLE PRECISION NOT NULL,
    "final_price" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_quote_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_providers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adapter_class" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "internal_tracking_number" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "provider_id" TEXT NOT NULL,
    "current_status" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_tracking_numbers" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "external_tracking_number" TEXT NOT NULL,
    "raw_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_tracking_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_statuses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_label" TEXT NOT NULL,

    CONSTRAINT "tracking_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "external_tracking_number_id" TEXT,
    "raw_status" TEXT NOT NULL,
    "canonical_status_id" TEXT NOT NULL,
    "event_time" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "shipment_id" TEXT,
    "request_url" TEXT NOT NULL,
    "request_payload" JSONB,
    "response_status" INTEGER,
    "response_payload" JSONB,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hashed_refresh_token" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'NationWide',
    "tagline" TEXT,
    "logo_path" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#7F1020',
    "website" TEXT,
    "support_email" TEXT,
    "support_phone" TEXT,
    "address" TEXT,
    "terms_and_conditions" TEXT,
    "footer_notes" TEXT,
    "insurance_disclaimer" TEXT,
    "legal_disclaimer" TEXT,
    "restricted_items_notice" TEXT,
    "gstin" TEXT,
    "legal_name" TEXT,
    "state_name" TEXT,
    "state_code" TEXT,
    "sac_code" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_card_documents" (
    "id" TEXT NOT NULL,
    "rate_provider_id" TEXT NOT NULL,
    "shipment_type" TEXT NOT NULL,
    "country_ids" TEXT[],
    "effective_date" TIMESTAMP(3) NOT NULL,
    "template_key" TEXT NOT NULL DEFAULT 'CLASSIC',
    "version" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "pdf_size_bytes" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generated_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_card_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "financial_year" TEXT NOT NULL,
    "order_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "custom_line_description" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "supplier_gstin" TEXT NOT NULL,
    "supplier_address" TEXT NOT NULL,
    "supplier_state_name" TEXT NOT NULL,
    "supplier_state_code" TEXT NOT NULL,
    "supplier_email" TEXT,
    "supplier_phone" TEXT,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "recipient_gstin" TEXT,
    "recipient_address" TEXT,
    "place_of_supply_state" TEXT NOT NULL,
    "place_of_supply_code" TEXT NOT NULL,
    "sac_code" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "taxable_value" DOUBLE PRECISION NOT NULL,
    "cgst_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_tax" DOUBLE PRECISION NOT NULL,
    "non_taxable_charges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "breakdown_source" TEXT NOT NULL,
    "pdf_path" TEXT,
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "issued_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_submission_key_key" ON "quotes"("submission_key");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_order_id_key" ON "quotes"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_selected_option_id_key" ON "quotes"("selected_option_id");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pickups_quote_id_key" ON "pickups"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickups_order_id_key" ON "pickups"("order_id");

-- CreateIndex
CREATE INDEX "pickups_status_idx" ON "pickups"("status");

-- CreateIndex
CREATE INDEX "pickups_scheduled_date_idx" ON "pickups"("scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_requests_quote_id_key" ON "pickup_requests"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_requests_order_id_key" ON "pickup_requests"("order_id");

-- CreateIndex
CREATE INDEX "pickup_requests_customer_id_idx" ON "pickup_requests"("customer_id");

-- CreateIndex
CREATE INDEX "pickup_requests_status_idx" ON "pickup_requests"("status");

-- CreateIndex
CREATE INDEX "pickup_requests_assigned_partner_id_idx" ON "pickup_requests"("assigned_partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_providers_code_key" ON "rate_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "zones_rate_provider_id_name_key" ON "zones"("rate_provider_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "zone_countries_rate_provider_id_country_id_key" ON "zone_countries"("rate_provider_id", "country_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_zone_id_shipment_type_key" ON "rate_cards"("zone_id", "shipment_type");

-- CreateIndex
CREATE INDEX "weight_slabs_rate_card_id_idx" ON "weight_slabs"("rate_card_id");

-- CreateIndex
CREATE INDEX "rate_quote_options_quote_id_idx" ON "rate_quote_options"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_providers_code_key" ON "shipping_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_internal_tracking_number_key" ON "shipments"("internal_tracking_number");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_sequence_number_key" ON "shipments"("sequence_number");

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_provider_id_idx" ON "shipments"("provider_id");

-- CreateIndex
CREATE INDEX "external_tracking_numbers_provider_id_external_tracking_num_idx" ON "external_tracking_numbers"("provider_id", "external_tracking_number");

-- CreateIndex
CREATE UNIQUE INDEX "external_tracking_numbers_shipment_id_provider_id_key" ON "external_tracking_numbers"("shipment_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_statuses_code_key" ON "tracking_statuses"("code");

-- CreateIndex
CREATE INDEX "tracking_events_shipment_id_created_at_idx" ON "tracking_events"("shipment_id", "created_at");

-- CreateIndex
CREATE INDEX "api_request_logs_provider_id_created_at_idx" ON "api_request_logs"("provider_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_provider_message_id_key" ON "notifications"("provider_message_id");

-- CreateIndex
CREATE INDEX "notifications_customer_id_created_at_idx" ON "notifications"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "rate_card_documents_rate_provider_id_idx" ON "rate_card_documents"("rate_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_customer_id_invoice_date_idx" ON "invoices"("customer_id", "invoice_date");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_financial_year_sequence_number_key" ON "invoices"("financial_year", "sequence_number");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_marked_by_admin_id_fkey" FOREIGN KEY ("payment_marked_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_quoted_by_admin_id_fkey" FOREIGN KEY ("quoted_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "rate_quote_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_confirmed_by_admin_id_fkey" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_assigned_partner_id_fkey" FOREIGN KEY ("assigned_partner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_countries" ADD CONSTRAINT "zone_countries_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_countries" ADD CONSTRAINT "zone_countries_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_countries" ADD CONSTRAINT "zone_countries_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_slabs" ADD CONSTRAINT "weight_slabs_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_slabs" ADD CONSTRAINT "weight_slabs_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_slabs" ADD CONSTRAINT "weight_slabs_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_quote_options" ADD CONSTRAINT "rate_quote_options_weight_slab_id_fkey" FOREIGN KEY ("weight_slab_id") REFERENCES "weight_slabs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "shipping_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_tracking_numbers" ADD CONSTRAINT "external_tracking_numbers_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_tracking_numbers" ADD CONSTRAINT "external_tracking_numbers_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "shipping_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "shipping_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_external_tracking_number_id_fkey" FOREIGN KEY ("external_tracking_number_id") REFERENCES "external_tracking_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_canonical_status_id_fkey" FOREIGN KEY ("canonical_status_id") REFERENCES "tracking_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "shipping_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_documents" ADD CONSTRAINT "rate_card_documents_rate_provider_id_fkey" FOREIGN KEY ("rate_provider_id") REFERENCES "rate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_documents" ADD CONSTRAINT "rate_card_documents_generated_by_admin_id_fkey" FOREIGN KEY ("generated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_admin_id_fkey" FOREIGN KEY ("issued_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

