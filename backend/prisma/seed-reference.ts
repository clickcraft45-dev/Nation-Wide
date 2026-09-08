/**
 * Reference data every deployment needs, and nothing else.
 *
 *   npm run db:seed:reference --workspace=backend
 *
 * Deliberately separate from seed.ts. That script is a development fixture: alongside this same
 * reference data it creates a demo customer, a demo order and a demo shipment so /track has
 * something to look up. Running it against production would put invented people in the customer
 * list, which is why the safe half is extracted here instead.
 *
 * Everything below is idempotent and additive — it fills gaps and never overwrites operator
 * choices, so it is safe to re-run after any deploy.
 *
 * WHAT THIS FIXES: without these rows the app looks empty even when it is working. Destination
 * pickers read `countries`; every provider's zone mapping is a join through it, so rate cards
 * exist but cannot be reached. `tracking_statuses` is worse than cosmetic — overrideTrackingStatus
 * looks a status up by code and throws NotFound when it is missing, so marking a shipment
 * delivered fails outright.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The canonical set the tracking pipeline maps every carrier's free text onto. Codes are a
// contract — the adapters, the notification templates and the UI all switch on them — so these
// are updated, never renamed.
const TRACKING_STATUSES = [
  { code: 'PICKED_UP', displayLabel: 'Picked Up' },
  { code: 'IN_TRANSIT', displayLabel: 'In Transit' },
  { code: 'OUT_FOR_DELIVERY', displayLabel: 'Out for Delivery' },
  { code: 'DELIVERED', displayLabel: 'Delivered' },
  { code: 'EXCEPTION', displayLabel: 'Delivery Exception' },
];

// Carriers the app can actually talk to. ICL's adapter is live and verified end-to-end; the
// others are rate-only today and get a ShippingProvider row when an adapter exists for them.
const SHIPPING_PROVIDERS = [
  { code: 'ICL', name: 'ICL', adapterClass: 'ICLShippingProviderAdapter' },
];

// Pricing providers — the entities that own zones and rate cards.
//
// ONLY carriers that appear in the supplied rate documents. Each one below is a sheet in
// docs/15th_July_2026_..._DHL_FEDEX.xlsx ("Fedex IP", "DHL", "UPS Express Saver Basic",
// "DPD REMOTE") or a tariff PDF in docs/. Nothing here is a plausible-looking placeholder: an
// invented carrier is a container an admin can build real rate cards inside, and then nobody
// remembers it was never real.
const RATE_PROVIDERS = [
  { code: 'FEDEX', name: 'FedEx' },
  { code: 'DHL', name: 'DHL' },
  { code: 'UPS', name: 'UPS' },
  { code: 'DPD', name: 'DPD' },
];

async function main(): Promise<void> {
  const countries = JSON.parse(
    readFileSync(join(__dirname, 'data', 'countries.json'), 'utf8'),
  ) as Array<{ code: string; name: string }>;

  const existingCodes = new Set(
    (await prisma.country.findMany({ select: { code: true } })).map((c) => c.code),
  );
  const missing = countries.filter((c) => !existingCodes.has(c.code));
  if (missing.length > 0) {
    await prisma.country.createMany({ data: missing });
  }
  console.log(`Countries:          ${countries.length} known, ${missing.length} added.`);

  for (const status of TRACKING_STATUSES) {
    await prisma.trackingStatus.upsert({
      where: { code: status.code },
      update: { displayLabel: status.displayLabel },
      create: status,
    });
  }
  console.log(`Tracking statuses:  ${TRACKING_STATUSES.length} ensured.`);

  for (const provider of SHIPPING_PROVIDERS) {
    await prisma.shippingProvider.upsert({
      where: { code: provider.code },
      // The adapter class is the one field worth correcting on an existing row: it is code, not
      // an operator's choice, and a stale value silently breaks tracking.
      update: { adapterClass: provider.adapterClass },
      create: { ...provider, isActive: true },
    });
  }
  console.log(`Shipping providers: ${SHIPPING_PROVIDERS.map((p) => p.code).join(', ')}`);

  for (const provider of RATE_PROVIDERS) {
    await prisma.rateProvider.upsert({
      where: { code: provider.code },
      // Never update: fuelChargePercent and pssPerKg are commercial settings an admin tunes in
      // the UI, and a redeploy must not reset them.
      update: {},
      create: provider,
    });
  }
  console.log(`Rate providers:     ${RATE_PROVIDERS.map((p) => p.code).join(', ')}`);

  const settings = await prisma.companySettings.findFirst();
  if (!settings) {
    console.log(
      'Company settings:   none yet — fill GSTIN, legal name and state code at /admin/settings.',
    );
  } else if (!settings.gstin || !settings.stateCode) {
    console.log(
      'Company settings:   incomplete — invoicing stays blocked until GSTIN and state code are set.',
    );
  }

  const zoneCountries = await prisma.zoneCountry.count();
  if (zoneCountries === 0) {
    console.log(
      '\nNOTE: no countries are assigned to zones yet, so the quote engine will return no rate\n' +
        'for any destination even though rate cards exist. Assign them at /admin/pricing/zones.',
    );
  }
}

main()
  .catch((error: Error) => {
    console.error(`Reference seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
