import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { formatInternalTrackingNumber } from '../src/modules/shipments/tracking-number';
import { nextSequenceNumber } from '../src/modules/shipments/sequence';

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

  const COUNTRIES: Array<{ code: string; name: string }> = [
    { code: 'IN', name: 'India' },
    { code: 'US', name: 'USA' },
    { code: 'GB', name: 'UK' },
    { code: 'AE', name: 'UAE' },
  ];

  for (const country of COUNTRIES) {
    await prisma.country.upsert({
      where: { code: country.code },
      update: { name: country.name },
      create: country,
    });
  }
  console.log(`Seeded ${COUNTRIES.length} countries.`);

  // Opt-in only — CI's seed step and a fresh local `npm run db:seed` both need to stay fast and
  // must never silently balloon a real environment's row counts. Set SEED_BULK_DEMO_DATA=true
  // locally when you actually need volume to manually check pagination/perf on list pages
  // (Customers/Orders/Quotes), which is unverifiable against the handful of rows above.
  if (process.env.SEED_BULK_DEMO_DATA === 'true') {
    await seedBulkDemoData(admin.id, iclProvider.id);
  }

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
}

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna',
  'Ishaan', 'Rohan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kiara', 'Myra',
  'Priya', 'Neha', 'Pooja', 'Riya',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Reddy', 'Rao', 'Iyer', 'Nair', 'Menon', 'Patel',
  'Shah', 'Khan', 'Singh', 'Kumar', 'Joshi', 'Desai',
];
const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
const TRACKING_CODES = [
  'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION',
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const BULK_CUSTOMER_COUNT = 60;
const BULK_ORDER_COUNT = 400;

async function seedBulkDemoData(adminId: string, providerId: string): Promise<void> {
  console.log(
    `SEED_BULK_DEMO_DATA=true — generating ~${BULK_CUSTOMER_COUNT} customers and ~${BULK_ORDER_COUNT} orders for pagination/perf testing. ` +
      'Orders are appended (not upserted) — re-running with this flag set adds another batch each time, it does not top up to a fixed total.',
  );

  const customerIds: string[] = [];
  for (let i = 0; i < BULK_CUSTOMER_COUNT; i++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const phone = `+9198765${String(10000 + i).padStart(5, '0')}`;
    const customer = await prisma.customer.upsert({
      where: { phone },
      update: {},
      create: {
        name,
        phone,
        consentSource: 'staff_entry',
        consentGivenAt: daysAgo(Math.floor(Math.random() * 180)),
      },
    });
    customerIds.push(customer.id);
  }
  console.log(`Seeded ${customerIds.length} bulk demo customers.`);

  let ordersCreated = 0;
  for (let i = 0; i < BULK_ORDER_COUNT; i++) {
    const customerId = pick(customerIds);
    const status = pick(ORDER_STATUSES);
    const createdAt = daysAgo(Math.floor(Math.random() * 120));

    const order = await prisma.order.create({
      data: { customerId, status, createdAt, updatedAt: createdAt },
    });

    // Mirrors ShipmentsService.createForOrder's placeholder-then-format pattern so the
    // resulting internalTrackingNumber looks exactly like a real one (NW-<yy>-<seq>), not an
    // obviously-fake bulk-seed value.
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId,
        sequenceNumber: await nextSequenceNumber(prisma),
        internalTrackingNumber: `PENDING-${randomUUID()}`,
        currentStatus: status === 'CANCELLED' ? null : pick(TRACKING_CODES),
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        internalTrackingNumber: formatInternalTrackingNumber(
          shipment.sequenceNumber,
          shipment.createdAt,
        ),
      },
    });

    if (status !== 'PENDING') {
      const paid = Math.random() > 0.15;
      await prisma.order.update({
        where: { id: order.id },
        data: paid
          ? {
              paymentStatus: 'PAID',
              paymentMethod: pick(['CASH', 'UPI', 'BANK_TRANSFER'] as const),
              paidAmount: Math.round((500 + Math.random() * 9500) * 100) / 100,
              paidAt: createdAt,
              paymentMarkedByAdminId: adminId,
            }
          : { paymentStatus: 'PENDING' },
      });
    }

    ordersCreated += 1;
  }
  console.log(`Seeded ${ordersCreated} bulk demo orders with shipments.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
