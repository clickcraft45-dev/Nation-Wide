import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { nextSequenceNumber } from '../src/modules/shipments/sequence';
import { REGISTERED_COMPANY } from '@nationwide/shared-types';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nationwide.dev';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

// The demo Customer below is login-capable (email + passwordHash), so all three roles the app
// has — ADMIN, PICKUP_PARTNER, CUSTOMER — can be signed into straight after a seed. Customers
// authenticate off the customers table, not admin_users; AuthService.findAccountByEmail checks
// admin_users first and falls through, so these emails must never collide with the two above.
const SEED_CUSTOMER_EMAIL = process.env.SEED_CUSTOMER_EMAIL ?? 'customer@nationwide.dev';
const SEED_CUSTOMER_PASSWORD = process.env.SEED_CUSTOMER_PASSWORD ?? 'ChangeMe123!';
const SEED_CUSTOMER_PHONE = '+911234500000';

async function main() {
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: {
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log(`Seeded admin user: ${admin.email} (role: ${admin.role})`);
  console.log(
    SEED_ADMIN_PASSWORD === 'ChangeMe123!'
      ? 'Using default dev password "ChangeMe123!" — override with SEED_ADMIN_PASSWORD for anything beyond local dev.'
      : 'Password set from SEED_ADMIN_PASSWORD env var.',
  );

  // Single-partner operation (for now, see PickupRequestsService.create's auto-assign) — this is
  // the one active Pickup Partner every new pickup request assigns to automatically.
  const SEED_PICKUP_PARTNER_EMAIL =
    process.env.SEED_PICKUP_PARTNER_EMAIL ?? 'pickup@nationwide.com';
  const SEED_PICKUP_PARTNER_PASSWORD =
    process.env.SEED_PICKUP_PARTNER_PASSWORD ?? 'ChangeMe123!';
  const pickupPartnerPasswordHash = await bcrypt.hash(SEED_PICKUP_PARTNER_PASSWORD, 10);

  const pickupPartner = await prisma.adminUser.upsert({
    where: { email: SEED_PICKUP_PARTNER_EMAIL },
    update: {},
    create: {
      email: SEED_PICKUP_PARTNER_EMAIL,
      passwordHash: pickupPartnerPasswordHash,
      role: 'PICKUP_PARTNER',
      name: 'Pickup Partner',
      phone: '+911234599999',
    },
  });
  console.log(`Seeded pickup partner user: ${pickupPartner.email} (role: ${pickupPartner.role})`);

  // Phase 6: real ICL Tracking API integration is live (verified end-to-end against
  // production), so this row points at ICLShippingProviderAdapter — see
  // provider-integration/adapters/icl/icl-shipping-provider.adapter.ts.
  const iclProvider = await prisma.shippingProvider.upsert({
    where: { code: 'ICL' },
    update: { adapterClass: 'ICLShippingProviderAdapter' },
    create: {
      code: 'ICL',
      name: 'ICL',
      adapterClass: 'ICLShippingProviderAdapter',
      isActive: true,
    },
  });

  console.log(
    `Seeded shipping provider: ${iclProvider.code} (adapter: ${iclProvider.adapterClass})`,
  );

  const TRACKING_STATUSES: Array<{ code: string; displayLabel: string }> = [
    { code: 'PICKED_UP', displayLabel: 'Picked Up' },
    { code: 'IN_TRANSIT', displayLabel: 'In Transit' },
    { code: 'OUT_FOR_DELIVERY', displayLabel: 'Out for Delivery' },
    { code: 'DELIVERED', displayLabel: 'Delivered' },
    { code: 'EXCEPTION', displayLabel: 'Delivery Exception' },
  ];

  for (const status of TRACKING_STATUSES) {
    await prisma.trackingStatus.upsert({
      where: { code: status.code },
      update: { displayLabel: status.displayLabel },
      create: status,
    });
  }
  console.log(`Seeded ${TRACKING_STATUSES.length} canonical tracking statuses.`);

  // Local-dev-only demo data so the /track page has a real tracking number to look up.
  // Unlike the admin upsert above, this one backfills on update: the row predates the seeded
  // password, and a staff-created Customer with no passwordHash is rejected at login as if it
  // didn't exist (AuthService.authenticate). Re-running the seed is how you reset it.
  const customerPasswordHash = await bcrypt.hash(SEED_CUSTOMER_PASSWORD, 10);
  const demoCustomer = await prisma.customer.upsert({
    where: { phone: SEED_CUSTOMER_PHONE },
    update: { email: SEED_CUSTOMER_EMAIL, passwordHash: customerPasswordHash, isActive: true },
    create: {
      name: 'Demo Customer',
      phone: SEED_CUSTOMER_PHONE,
      email: SEED_CUSTOMER_EMAIL,
      passwordHash: customerPasswordHash,
      consentSource: 'signup_form',
      consentGivenAt: new Date(),
    },
  });
  console.log(`Seeded customer user: ${demoCustomer.email} (role: CUSTOMER)`);

  const demoOrder = await prisma.order.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      customerId: demoCustomer.id,
      status: 'CONFIRMED',
    },
  });

  const demoInternalTrackingNumber = 'NW-DEMOTRACK1';
  const demoShipment = await prisma.shipment.upsert({
    where: { internalTrackingNumber: demoInternalTrackingNumber },
    update: {},
    create: {
      orderId: demoOrder.id,
      providerId: iclProvider.id,
      sequenceNumber: await nextSequenceNumber(prisma),
      internalTrackingNumber: demoInternalTrackingNumber,
    },
  });

  await prisma.externalTrackingNumber.upsert({
    where: {
      // no natural unique constraint on (shipmentId, providerId) alone, so key off a fixed id
      id: '00000000-0000-0000-0000-000000000002',
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      shipmentId: demoShipment.id,
      providerId: iclProvider.id,
      externalTrackingNumber: 'ICL-DEMO-000001',
    },
  });

  console.log(`Seeded demo shipment for local testing: ${demoInternalTrackingNumber}`);

  // Pricing engine (Section: Dynamic Shipping Quotation) — RateProvider is independent from
  // ShippingProvider above; it's pure admin-managed pricing data, no adapter class involved.
  const RATE_PROVIDERS: Array<{ code: string; name: string }> = [
    { code: 'FEDEX', name: 'FedEx' },
    { code: 'UPS', name: 'UPS' },
    { code: 'DHL', name: 'DHL' },
    { code: 'DHL_EXPRESS', name: 'DHL Express' },
  ];

  for (const provider of RATE_PROVIDERS) {
    await prisma.rateProvider.upsert({
      where: { code: provider.code },
      update: { name: provider.name },
      create: provider,
    });
  }
  console.log(`Seeded ${RATE_PROVIDERS.length} rate providers.`);

  // The real ISO country list, not a sample — destination pickers and every provider's zone
  // mapping read from this table, so a database holding only a handful of countries is a broken
  // app, not a lightly-seeded one. Lived in the (now deleted) demo seed until 2026-08-30.
  const COUNTRIES = JSON.parse(
    readFileSync(join(__dirname, 'data', 'countries.json'), 'utf8'),
  ) as Array<{ code: string; name: string }>;

  const existingCountryCodes = new Set(
    (await prisma.country.findMany({ select: { code: true } })).map((c) => c.code),
  );
  const missingCountries = COUNTRIES.filter(
    (c) => !existingCountryCodes.has(c.code),
  );
  if (missingCountries.length > 0) {
    await prisma.country.createMany({ data: missingCountries });
  }
  console.log(
    `Countries: ${COUNTRIES.length} known, ${missingCountries.length} added.`,
  );

  console.log();
  console.log('Dev login credentials (override with the SEED_* env vars):');
  console.table([
    { role: 'ADMIN', email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    {
      role: 'PICKUP_PARTNER',
      email: SEED_PICKUP_PARTNER_EMAIL,
      password: SEED_PICKUP_PARTNER_PASSWORD,
    },
    { role: 'CUSTOMER', email: SEED_CUSTOMER_EMAIL, password: SEED_CUSTOMER_PASSWORD },
  ]);

  await seedCompanySettings();
}

/**
 * The supplier's GST identity, from REGISTERED_COMPANY (transcribed from the registration
 * certificate). CompanySettingsService already creates a NEW row from the same constant, so this
 * exists for the database that already has a row — one created blank before the registration was
 * recorded, which is exactly the state that makes the first invoice fail its statutory-fields
 * check.
 *
 * BLANKS ONLY. It fills fields that are null or empty and never overwrites a value, because a
 * value that is already there was put there by an admin in the Rate Card Settings dialog, and a
 * seed re-run must not quietly revert their correction.
 */
async function seedCompanySettings() {
  const existing = await prisma.companySettings.findFirst();
  if (!existing) {
    const created = await prisma.companySettings.create({
      data: { ...REGISTERED_COMPANY },
    });
    console.log(
      `Seeded company settings: ${created.companyName} (${created.gstin})`,
    );
    return;
  }

  // `companyName` is the one field with a schema default ("NationWide"), so it is never null and
  // "blanks only" would skip it forever. An untouched default is a stub, not a decision — the
  // registered trade name replaces it, and anything else an admin typed is left alone.
  const isUnset = (field: string, value: unknown) =>
    !value || (field === 'companyName' && value === 'NationWide');

  const fills = Object.fromEntries(
    Object.entries(REGISTERED_COMPANY).filter(([field]) =>
      isUnset(field, existing[field as keyof typeof existing]),
    ),
  );

  if (Object.keys(fills).length === 0) {
    console.log(
      `Company settings already set (${existing.companyName} / ${existing.gstin ?? 'no GSTIN'}) — left untouched.`,
    );
    return;
  }

  await prisma.companySettings.update({
    where: { id: existing.id },
    data: fills,
  });
  console.log(
    `Filled blank company settings from the GST registration: ${Object.keys(fills).join(', ')}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
