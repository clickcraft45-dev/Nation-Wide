import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nationwide.dev';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

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
  const demoCustomer = await prisma.customer.upsert({
    where: { phone: '+911234500000' },
    update: {},
    create: {
      name: 'Demo Customer',
      phone: '+911234500000',
      consentSource: 'staff_entry',
      consentGivenAt: new Date(),
    },
  });

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
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
