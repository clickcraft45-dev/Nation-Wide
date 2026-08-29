/**
 * Demo data seed — everything the admin/customer/partner screens need in order to look like a
 * running operation: the full country list, every provider's zones and rate cards, and ~25 rows
 * of each customer-facing entity (customers, quotes, pickup requests, orders, shipments,
 * tracking events, notifications, audit logs).
 *
 *   npm run db:seed         # base seed first — admin/partner/customer logins, tracking statuses
 *   npm run db:fix-indexes  # once per database, and again after every `prisma db push`
 *   npm run db:seed:demo    # this script
 *
 * The index step is not optional on MongoDB: Prisma's `db push` builds plain unique indexes on
 * the optional unique columns, and Mongo indexes a missing field as null, so only ONE quote may
 * exist without an order, one customer without an email, and so on. Without it this script dies
 * with P2002 on the second row of each — and so does the live app. See
 * scripts/fix-nullable-unique-indexes.js.
 *
 * Re-runnable. Demo customers (and everything hanging off them) are identified by the
 * +9199000xxxxx phone prefix and wiped at the start of each run; pricing data is upserted, and
 * weight slabs are only written for rate cards that have none, so an admin's own edited rates
 * are never overwritten.
 *
 * WHERE THE RATES COME FROM: DHL's and UPS's published all-in tariff sheets, already in this
 * repo at scripts/data/*.json and used by the one-off scripts/import-dhl.js / import-ups.js
 * imports. This script takes the first 25 weight checkpoints of each so the demo DB stays
 * small — run those two scripts instead when you need the complete published tables. FedEx and
 * DHL Express have no sheet here, so their rates are DHL's scaled by a flat factor: demo
 * numbers, plausible but not published tariffs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { formatInternalTrackingNumber } from '../src/modules/shipments/tracking-number';
import { nextSequenceNumber } from '../src/modules/shipments/sequence';

const prisma = new PrismaClient();

const DEMO_PHONE_PREFIX = '+9199000';

/**
 * The demo customers' phone numbers, generated rather than pattern-matched.
 *
 * Prisma's MongoDB connector compiles `startsWith` into a `$regexMatch` without escaping the
 * needle, and this prefix opens with '+' — a quantifier with nothing to repeat, which Mongo
 * rejects outright (error 51111). Listing the exact numbers sidesteps the operator entirely and
 * is exact besides: nothing outside this range can be mistaken for demo data.
 *
 * The range runs past DEMO_SIZE so that lowering DEMO_SIZE still cleans up the rows an earlier,
 * larger run left behind.
 */
const DEMO_PHONE_POOL = 200;

// One password for every demo account — customers and staff alike. Local demo data only; the
// real admin/partner logins still come from `npm run db:seed` and its SEED_* env vars.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo1234!';

// The back office. Emails are @demo.nationwide.dev so they can never collide with the real
// admin/partner rows the base seed creates, and these are upserted rather than deleted on
// re-run — audit logs, pickups and orders all point at them.
const DEMO_TEAM: {
  email: string;
  name: string;
  phone: string;
  role: 'ADMIN' | 'STAFF' | 'PICKUP_PARTNER';
}[] = [
  {
    email: 'ops.head@demo.nationwide.dev',
    name: 'Ritu Malhotra',
    phone: '+919810000001',
    role: 'ADMIN',
  },
  {
    email: 'desk.mumbai@demo.nationwide.dev',
    name: 'Sanjay Kamble',
    phone: '+919810000002',
    role: 'STAFF',
  },
  {
    email: 'desk.delhi@demo.nationwide.dev',
    name: 'Ayesha Siddiqui',
    phone: '+919810000003',
    role: 'STAFF',
  },
  {
    email: 'desk.chennai@demo.nationwide.dev',
    name: 'Vignesh Raman',
    phone: '+919810000004',
    role: 'STAFF',
  },
  {
    email: 'partner.mumbai@demo.nationwide.dev',
    name: 'Imran Qureshi',
    phone: '+919820000001',
    role: 'PICKUP_PARTNER',
  },
  {
    email: 'partner.delhi@demo.nationwide.dev',
    name: 'Harpreet Kaur',
    phone: '+919820000002',
    role: 'PICKUP_PARTNER',
  },
  {
    email: 'partner.bengaluru@demo.nationwide.dev',
    name: 'Naveen Gowda',
    phone: '+919820000003',
    role: 'PICKUP_PARTNER',
  },
  {
    email: 'partner.hyderabad@demo.nationwide.dev',
    name: 'Sridhar Yadav',
    phone: '+919820000004',
    role: 'PICKUP_PARTNER',
  },
  {
    email: 'partner.kolkata@demo.nationwide.dev',
    name: 'Debjani Roy',
    phone: '+919820000005',
    role: 'PICKUP_PARTNER',
  },
  {
    email: 'partner.pune@demo.nationwide.dev',
    name: 'Aniket Deshmukh',
    phone: '+919820000006',
    role: 'PICKUP_PARTNER',
  },
];

function demoPhone(index: number): string {
  return `${DEMO_PHONE_PREFIX}${String(index + 1).padStart(5, '0')}`;
}

const DEMO_PHONES = Array.from({ length: DEMO_PHONE_POOL }, (_, i) =>
  demoPhone(i),
);
const DEMO_SIZE = 25;

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(join(__dirname, ...segments), 'utf8')) as T;
}

interface RateTable {
  weight: number;
  rates: Record<string, number>;
}

const COUNTRIES = readJson<{ code: string; name: string }[]>(
  'data',
  'countries.json',
);
const DHL_ZONES = readJson<{ code: string; zone: string }[]>(
  '..',
  'scripts',
  'data',
  'dhl-zones.json',
);
const UPS_ZONES = readJson<Record<string, string>>(
  '..',
  'scripts',
  'data',
  'ups-country-zones.json',
);
const DHL_TABLES = readJson<{ table2: RateTable[] }>(
  '..',
  'scripts',
  'data',
  'dhl-tables.json',
);
const UPS_TABLES = readJson<{ packageRows: RateTable[] }>(
  '..',
  'scripts',
  'data',
  'ups-tables.json',
);

// ---------------------------------------------------------------------------
// Demo dictionaries
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Aarav',
  'Vivaan',
  'Aditya',
  'Vihaan',
  'Arjun',
  'Sai',
  'Reyansh',
  'Krishna',
  'Ishaan',
  'Rohan',
  'Ananya',
  'Diya',
  'Saanvi',
  'Aadhya',
  'Kiara',
  'Myra',
  'Priya',
  'Neha',
  'Pooja',
  'Riya',
  'Farhan',
  'Zoya',
  'Imran',
  'Meera',
  'Kabir',
];
const LAST_NAMES = [
  'Sharma',
  'Verma',
  'Gupta',
  'Reddy',
  'Rao',
  'Iyer',
  'Nair',
  'Menon',
  'Patel',
  'Shah',
  'Khan',
  'Singh',
  'Kumar',
  'Joshi',
  'Desai',
  'Bose',
  'Chatterjee',
  'Pillai',
  'Kulkarni',
  'Bhat',
];

// Real PIN codes, so the pincode verification endpoint resolves them against India Post.
const INDIAN_CITIES = [
  { city: 'Mumbai', state: 'Maharashtra', postalCode: '400001' },
  { city: 'New Delhi', state: 'Delhi', postalCode: '110001' },
  { city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
  { city: 'Hyderabad', state: 'Telangana', postalCode: '500001' },
  { city: 'Chennai', state: 'Tamil Nadu', postalCode: '600001' },
  { city: 'Kolkata', state: 'West Bengal', postalCode: '700001' },
  { city: 'Pune', state: 'Maharashtra', postalCode: '411001' },
  { city: 'Ahmedabad', state: 'Gujarat', postalCode: '380001' },
  { city: 'Jaipur', state: 'Rajasthan', postalCode: '302001' },
  { city: 'Kochi', state: 'Kerala', postalCode: '682001' },
  { city: 'Lucknow', state: 'Uttar Pradesh', postalCode: '226001' },
  { city: 'Chandigarh', state: 'Chandigarh', postalCode: '160001' },
];

const DESTINATIONS = [
  {
    country: 'United States',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
  },
  {
    country: 'United Kingdom',
    city: 'London',
    state: 'England',
    postalCode: 'SW1A 1AA',
  },
  {
    country: 'United Arab Emirates',
    city: 'Dubai',
    state: 'Dubai',
    postalCode: '00000',
  },
  {
    country: 'Singapore',
    city: 'Singapore',
    state: 'Central',
    postalCode: '018956',
  },
  { country: 'Australia', city: 'Sydney', state: 'NSW', postalCode: '2000' },
  { country: 'Canada', city: 'Toronto', state: 'ON', postalCode: 'M5H 2N2' },
  { country: 'Germany', city: 'Berlin', state: 'Berlin', postalCode: '10115' },
  {
    country: 'France',
    city: 'Paris',
    state: 'Île-de-France',
    postalCode: '75001',
  },
  { country: 'Japan', city: 'Tokyo', state: 'Tokyo', postalCode: '100-0001' },
  {
    country: 'New Zealand',
    city: 'Auckland',
    state: 'Auckland',
    postalCode: '1010',
  },
  {
    country: 'South Africa',
    city: 'Cape Town',
    state: 'Western Cape',
    postalCode: '8001',
  },
  {
    country: 'Saudi Arabia',
    city: 'Riyadh',
    state: 'Riyadh',
    postalCode: '11564',
  },
];

const PARCEL_DESCRIPTIONS = [
  'Legal documents',
  'Textile samples',
  'Spare machine parts',
  'Handicraft items',
  'Pharmaceutical samples',
  'Books and stationery',
  'Electronics accessories',
  'Ayurvedic products',
  'Wedding invitations',
  'Leather goods',
  'Jewellery (declared)',
  'Packaged food gifts',
];

const TIME_SLOTS = ['09:00-12:00', '12:00-15:00', '15:00-18:00'];
const SHIPMENT_TYPES = ['DOCUMENT', 'PARCEL', 'PACKAGE'] as const;
const TRACKING_FLOW = [
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const PROVIDERS = [
  {
    code: 'FEDEX',
    name: 'FedEx',
    fuelChargePercent: 22.5,
    pssPerKg: 8,
    factor: 1.08,
  },
  { code: 'UPS', name: 'UPS', fuelChargePercent: 24, pssPerKg: 6, factor: 1 },
  {
    code: 'DHL',
    name: 'DHL',
    fuelChargePercent: 26.5,
    pssPerKg: 10,
    factor: 1,
  },
  {
    code: 'DHL_EXPRESS',
    name: 'DHL Express',
    fuelChargePercent: 28,
    pssPerKg: 12,
    factor: 1.18,
  },
];

// FedEx publishes lettered zones; nothing in this repo maps countries to them, so the demo
// borrows DHL's country grouping and renames the zones. Clearly not FedEx's real zone map.
const FEDEX_ZONE_LETTERS = 'ABCDEFGHIJKLMNO';

// Deterministic pseudo-randomness: same seed data on every run, so screenshots and bug reports
// stay comparable between machines. Not security-relevant.
let rngState = 20260825;
function random(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9 + Math.floor(random() * 8), 0, 0, 0);
  return d;
}
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------

async function main() {
  const admin = await prisma.adminUser.findFirst({ where: { role: 'ADMIN' } });
  const partner = await prisma.adminUser.findFirst({
    where: { role: 'PICKUP_PARTNER' },
  });
  const shippingProvider = await prisma.shippingProvider.findFirst({
    where: { code: 'ICL' },
  });
  if (!admin || !partner || !shippingProvider) {
    throw new Error(
      'Run `npm run db:seed` first — this script builds on its admin/partner/provider rows.',
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await wipePreviousDemoData();
  await seedCountries();
  const team = await seedTeam(passwordHash);
  const providerIds = await seedProvidersZonesAndRates(admin.id);
  const customers = await seedCustomers(passwordHash);
  const quotes = await seedQuotes(customers, providerIds, admin.id);
  const partnerIds =
    team.partnerIds.length > 0 ? team.partnerIds : [partner.id];
  const pickupRequests = await seedPickupRequests(quotes, partnerIds);
  await seedOrders(pickupRequests, customers, shippingProvider.id, admin.id);
  await seedLegacyPickups(customers, team, admin.id, shippingProvider.id);
  await seedNotifications(customers);
  await seedAuditLogs(admin.id, quotes);

  console.log(
    '\nDemo data ready. Every demo account below shares one password.',
  );
  console.table([
    ...DEMO_TEAM.map((member) => ({
      role: member.role,
      email: member.email,
      password: DEMO_PASSWORD,
    })),
    {
      role: 'CUSTOMER',
      email: 'see the Customers list — all @example.com',
      password: DEMO_PASSWORD,
    },
  ]);
}

/** Back-office accounts: extra admins, counter staff, and the field pickup partners. */
async function seedTeam(passwordHash: string) {
  const staffIds: string[] = [];
  const partnerIds: string[] = [];

  for (const member of DEMO_TEAM) {
    const user = await prisma.adminUser.upsert({
      where: { email: member.email },
      // Backfilled on re-run: a demo account whose password drifted is useless.
      update: {
        name: member.name,
        phone: member.phone,
        role: member.role,
        passwordHash,
      },
      create: {
        email: member.email,
        name: member.name,
        phone: member.phone,
        role: member.role,
        passwordHash,
      },
    });
    if (member.role === 'PICKUP_PARTNER') partnerIds.push(user.id);
    else staffIds.push(user.id);
  }

  console.log(
    `Team: ${staffIds.length} admin/staff accounts, ${partnerIds.length} pickup partners.`,
  );
  return { staffIds, partnerIds };
}

/** Everything hanging off a demo customer, deepest relation first (Mongo has no cascades). */
async function wipePreviousDemoData(): Promise<void> {
  const demoCustomers = await prisma.customer.findMany({
    where: { phone: { in: DEMO_PHONES } },
    select: { id: true },
  });
  if (demoCustomers.length === 0) return;
  const customerIds = demoCustomers.map((c) => c.id);

  const orders = await prisma.order.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  const shipments = await prisma.shipment.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const shipmentIds = shipments.map((s) => s.id);

  await prisma.trackingEvent.deleteMany({
    where: { shipmentId: { in: shipmentIds } },
  });
  await prisma.externalTrackingNumber.deleteMany({
    where: { shipmentId: { in: shipmentIds } },
  });
  await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });

  // Quote.selectedOptionId points at a RateQuoteOption which points back at the quote — break
  // the cycle before deleting either side.
  await prisma.quote.updateMany({
    where: { customerId: { in: customerIds } },
    data: { selectedOptionId: null },
  });
  const quotes = await prisma.quote.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true },
  });
  const quoteIds = quotes.map((q) => q.id);

  await prisma.rateQuoteOption.deleteMany({
    where: { quoteId: { in: quoteIds } },
  });
  await prisma.pickupRequest.deleteMany({
    where: { customerId: { in: customerIds } },
  });
  await prisma.pickup.deleteMany({ where: { quoteId: { in: quoteIds } } });
  await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.notification.deleteMany({
    where: { customerId: { in: customerIds } },
  });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });

  console.log(
    `Cleared ${customerIds.length} previous demo customers and their orders/quotes.`,
  );
}

async function seedCountries(): Promise<void> {
  const existing = await prisma.country.findMany({ select: { code: true } });
  const known = new Set(existing.map((c) => c.code));
  const missing = COUNTRIES.filter((c) => !known.has(c.code));

  if (missing.length > 0) {
    await prisma.country.createMany({
      data: missing.map((c) => ({ code: c.code, name: c.name })),
    });
  }
  console.log(
    `Countries: ${known.size} already present, ${missing.length} added (${COUNTRIES.length} total).`,
  );
}

/** Zone name for one country under one provider, or null when that provider doesn't serve it. */
function zoneFor(providerCode: string, countryCode: string): string | null {
  const dhlZone = DHL_ZONES.find((z) => z.code === countryCode)?.zone ?? null;
  switch (providerCode) {
    case 'UPS':
      return UPS_ZONES[countryCode] ?? null;
    case 'FEDEX': {
      if (!dhlZone) return null;
      const index =
        Math.min(Number.parseInt(dhlZone, 10) || 1, FEDEX_ZONE_LETTERS.length) -
        1;
      return `Zone ${FEDEX_ZONE_LETTERS[index]}`;
    }
    default:
      return dhlZone;
  }
}

/** 25 weight slabs for one zone, from the provider's published checkpoints. */
function slabsFor(providerCode: string, zoneName: string, factor: number) {
  const rows =
    providerCode === 'UPS'
      ? UPS_TABLES.packageRows.slice(0, DEMO_SIZE)
      : DHL_TABLES.table2.slice(0, DEMO_SIZE);

  // A zone the sheet doesn't list (FedEx's renamed zones, UPS's country-specific columns)
  // falls back to the sheet's first column so every zone still gets a full tariff.
  const columnOf = (rates: Record<string, number>) => {
    const key =
      providerCode === 'FEDEX' ? zoneName.replace('Zone ', '') : zoneName;
    return rates[key] ?? rates[Object.keys(rates)[0]];
  };

  let previousWeight = 0;
  return rows.map((row) => {
    const from = previousWeight === 0 ? 0.01 : round(previousWeight + 0.01);
    previousWeight = row.weight;
    return {
      weightFromKg: from,
      weightToKg: row.weight,
      baseRate: Math.round(columnOf(row.rates) * factor),
    };
  });
}

async function seedProvidersZonesAndRates(adminId: string): Promise<string[]> {
  const providerIds: string[] = [];
  const countries = await prisma.country.findMany({
    select: { id: true, code: true },
  });
  const countryIdByCode = new Map(countries.map((c) => [c.code, c.id]));

  for (const provider of PROVIDERS) {
    const rateProvider = await prisma.rateProvider.upsert({
      where: { code: provider.code },
      update: {
        name: provider.name,
        fuelChargePercent: provider.fuelChargePercent,
        pssPerKg: provider.pssPerKg,
      },
      create: {
        code: provider.code,
        name: provider.name,
        fuelChargePercent: provider.fuelChargePercent,
        pssPerKg: provider.pssPerKg,
      },
    });
    providerIds.push(rateProvider.id);

    // Country -> zone name for this provider, then zone name -> Zone row.
    const assignments = new Map<string, string[]>();
    for (const [code, countryId] of countryIdByCode) {
      const zoneName = zoneFor(provider.code, code);
      if (!zoneName) continue;
      assignments.set(zoneName, [
        ...(assignments.get(zoneName) ?? []),
        countryId,
      ]);
    }

    let mappedCountries = 0;
    let slabsWritten = 0;
    let cardsKept = 0;

    for (const [zoneName, countryIds] of assignments) {
      const zone = await prisma.zone.upsert({
        where: {
          rateProviderId_name: {
            rateProviderId: rateProvider.id,
            name: zoneName,
          },
        },
        update: {},
        create: { rateProviderId: rateProvider.id, name: zoneName },
      });

      for (const countryId of countryIds) {
        await prisma.zoneCountry.upsert({
          where: {
            rateProviderId_countryId: {
              rateProviderId: rateProvider.id,
              countryId,
            },
          },
          update: { zoneId: zone.id },
          create: {
            zoneId: zone.id,
            countryId,
            rateProviderId: rateProvider.id,
          },
        });
        mappedCountries += 1;
      }

      for (const shipmentType of SHIPMENT_TYPES) {
        const rateCard = await prisma.rateCard.upsert({
          where: { zoneId_shipmentType: { zoneId: zone.id, shipmentType } },
          update: {},
          create: {
            zoneId: zone.id,
            shipmentType,
            currency: 'INR',
            createdByAdminId: adminId,
          },
        });

        // Never overwrite rates an admin may have edited — only fill empty cards.
        const existingSlabs = await prisma.weightSlab.count({
          where: { rateCardId: rateCard.id },
        });
        if (existingSlabs > 0) {
          cardsKept += 1;
          continue;
        }

        // Documents move cheaper than parcels at the same weight; packages carry a handling
        // premium. Both are demo multipliers over the published parcel column.
        const typeFactor =
          shipmentType === 'DOCUMENT'
            ? 0.88
            : shipmentType === 'PACKAGE'
              ? 1.06
              : 1;
        const slabs = slabsFor(
          provider.code,
          zoneName,
          provider.factor * typeFactor,
        );
        await prisma.weightSlab.createMany({
          data: slabs.map((slab) => ({
            rateCardId: rateCard.id,
            ...slab,
            gstPercent: 18,
            nationwideCut: 150 + Math.round(random() * 250),
            createdByAdminId: adminId,
          })),
        });
        slabsWritten += slabs.length;
      }
    }

    console.log(
      `${provider.name}: ${assignments.size} zones, ${mappedCountries} countries mapped, ` +
        `${slabsWritten} weight slabs written` +
        (cardsKept > 0 ? `, ${cardsKept} rate cards left alone (they already had rates).` : '.'),
    );
  }

  return providerIds;
}

async function seedCustomers(passwordHash: string) {
  const customers: { id: string }[] = [];
  for (let i = 0; i < DEMO_SIZE; i++) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${pick(LAST_NAMES)}`;
    const phone = demoPhone(i);
    const home = pick(INDIAN_CITIES);
    customers.push(
      await prisma.customer.create({
        data: {
          name,
          phone,
          email: `${name.toLowerCase().replace(/[^a-z]/g, '.')}.${i + 1}@example.com`,
          // Login-capable: a Customer with no passwordHash is rejected at sign-in as if it
          // didn't exist (AuthService.authenticate), which makes the customer app untestable.
          passwordHash,
          address: `${10 + i} MG Road, ${home.city} ${home.postalCode}`,
          consentSource: i % 3 === 0 ? 'staff_entry' : 'signup_form',
          consentGivenAt: daysFromNow(-(30 + i)),
          createdAt: daysFromNow(-(30 + i)),
        },
      }),
    );
  }
  console.log(`Seeded ${customers.length} demo customers.`);
  return customers;
}

const QUOTE_PLAN = [
  // 25 quotes carry a pickup request (below); the rest sit in the earlier states so every
  // admin filter has something in it.
  ...Array<string>(DEMO_SIZE).fill('PICKUP_REQUESTED'),
  'RATED',
  'RATED',
  'QUOTED',
  'NEEDS_MANUAL_REVIEW',
  'REJECTED',
] as const;

async function seedQuotes(
  customers: { id: string }[],
  providerIds: string[],
  adminId: string,
) {
  // One (rateCard, slab) pair per provider to hang RateQuoteOption snapshots off — the demo
  // doesn't need the real engine here, only options that look like the engine wrote them.
  const rateCards = await prisma.rateCard.findMany({
    where: { shipmentType: 'PARCEL' },
    take: 40,
    include: { weightSlabs: { take: 1 }, zone: true },
  });
  const usableCards = rateCards.filter((c) => c.weightSlabs.length > 0);

  const quotes: {
    id: string;
    customerId: string;
    status: string;
    weightKg: number;
    shipmentType: string;
  }[] = [];

  for (let i = 0; i < QUOTE_PLAN.length; i++) {
    const status = QUOTE_PLAN[i];
    const customer = customers[i % customers.length];
    const origin = pick(INDIAN_CITIES);
    const destination = pick(DESTINATIONS);
    const shipmentType = pick(SHIPMENT_TYPES);
    const weightKg = round(0.5 + random() * 9.5);
    const createdAt = daysFromNow(-Math.floor(random() * 45));

    const quote = await prisma.quote.create({
      data: {
        customerId: customer.id,
        shipmentType,
        weightKg,
        description: pick(PARCEL_DESCRIPTIONS),
        originName: `Sender ${i + 1}`,
        originPhone: demoPhone(i),
        originAddressLine1: `${12 + i} Industrial Estate`,
        originCity: origin.city,
        originState: origin.state,
        originPostalCode: origin.postalCode,
        originCountry: 'India',
        destName: `Receiver ${i + 1}`,
        destPhone: '+15550100200',
        destAddressLine1: `${40 + i} Market Street`,
        destCity: destination.city,
        destState: destination.state,
        destPostalCode: destination.postalCode,
        destCountry: destination.country,
        status: status as Prisma.QuoteCreateInput['status'],
        reviewReason: status === 'NEEDS_MANUAL_REVIEW' ? 'OVERSIZED' : null,
        quotedAmount:
          status === 'QUOTED' ? round(3000 + random() * 12000) : null,
        quotedByAdminId: status === 'QUOTED' ? adminId : null,
        quotedAt: status === 'QUOTED' ? createdAt : null,
        rejectionReason:
          status === 'REJECTED'
            ? 'Restricted commodity for this destination.'
            : null,
        submissionKey: `demo-${createdAt.getTime()}-${i}`,
        optionsExpireAt: daysFromNow(7),
        createdAt,
        updatedAt: createdAt,
      },
    });

    // Priced states get one snapshot per provider, exactly as the engine writes them.
    if (
      usableCards.length > 0 &&
      status !== 'NEEDS_MANUAL_REVIEW' &&
      status !== 'REJECTED'
    ) {
      let firstOptionId: string | null = null;
      for (const providerId of providerIds) {
        const card = usableCards[Math.floor(random() * usableCards.length)];
        const slab = card.weightSlabs[0];
        const provider = await prisma.rateProvider.findUniqueOrThrow({
          where: { id: providerId },
        });

        const baseRate = slab.baseRate;
        const pssAmount = round(provider.pssPerKg * weightKg);
        const fuelChargeAmount = round(
          (baseRate * provider.fuelChargePercent) / 100,
        );
        const taxableSubtotal = round(
          baseRate + pssAmount + fuelChargeAmount + slab.nationwideCut,
        );
        const gstAmount = round((taxableSubtotal * slab.gstPercent) / 100);

        const option = await prisma.rateQuoteOption.create({
          data: {
            quoteId: quote.id,
            rateProviderId: providerId,
            rateCardId: card.id,
            weightSlabId: slab.id,
            currency: 'INR',
            baseRate,
            pssAmount,
            fuelChargePercent: provider.fuelChargePercent,
            fuelChargeAmount,
            taxableSubtotal,
            gstPercent: slab.gstPercent,
            gstAmount,
            nationwideCut: slab.nationwideCut,
            finalPrice: round(taxableSubtotal + gstAmount),
            createdAt,
          },
        });
        firstOptionId ??= option.id;
      }

      if (firstOptionId && status === 'PICKUP_REQUESTED') {
        await prisma.quote.update({
          where: { id: quote.id },
          data: { selectedOptionId: firstOptionId },
        });
      }
    }

    quotes.push({
      id: quote.id,
      customerId: customer.id,
      status,
      weightKg,
      shipmentType,
    });
  }

  console.log(`Seeded ${quotes.length} demo quotes with rate options.`);
  return quotes;
}

const PICKUP_STATUS_PLAN = [
  'PENDING_ASSIGNMENT',
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ASSIGNED',
  'SCHEDULED',
  'SCHEDULED',
  'OUT_FOR_PICKUP',
  'VERIFICATION_PENDING',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'SCHEDULED',
  'ASSIGNED',
] as const;

async function seedPickupRequests(
  quotes: {
    id: string;
    customerId: string;
    status: string;
    weightKg: number;
    shipmentType: string;
  }[],
  partnerIds: string[],
) {
  const providers = await prisma.rateProvider.findMany();
  const candidates = quotes
    .filter((q) => q.status === 'PICKUP_REQUESTED')
    .slice(0, DEMO_SIZE);
  const created: Awaited<ReturnType<typeof prisma.pickupRequest.create>>[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const quote = candidates[i];
    const status = PICKUP_STATUS_PLAN[i % PICKUP_STATUS_PLAN.length];
    const provider = pick(providers);
    const location = pick(INDIAN_CITIES);
    const dropAtWarehouse = i % 7 === 0;
    const estimatedPrice = round(2500 + random() * 14000);
    // Spread across the calendar so the dashboard/partner run-sheet calendars have dots on
    // past, present and future days.
    const pickupDate = daysFromNow(Math.floor(random() * 21) - 10);
    const terminal = status === 'COMPLETED';

    const request = await prisma.pickupRequest.create({
      data: {
        quoteId: quote.id,
        customerId: quote.customerId,
        rateProviderId: provider.id,
        rateProviderName: provider.name,
        shipmentType:
          quote.shipmentType as Prisma.PickupRequestCreateInput['shipmentType'],
        estimatedWeightKg: quote.weightKg,
        estimatedPrice,
        currency: 'INR',
        dropAtWarehouse,
        pickupContactName: `Contact ${i + 1}`,
        pickupContactPhone: demoPhone(i),
        pickupAddressLine1: `${21 + i}, Trade Centre`,
        pickupAddressLine2: i % 3 === 0 ? 'Near Metro Station' : null,
        pickupCity: location.city,
        pickupState: location.state,
        pickupPostalCode: location.postalCode,
        pickupDate: dropAtWarehouse ? null : pickupDate,
        pickupTimeSlot: dropAtWarehouse ? null : pick(TIME_SLOTS),
        pickupInstructions:
          i % 4 === 0 ? 'Call before arriving; gate closes at 6pm.' : null,
        status,
        // Round-robin across the partner bench so the admin's partner filter and each
        // partner's own run sheet both have work in them.
        assignedPartnerId:
          status === 'PENDING_ASSIGNMENT'
            ? null
            : partnerIds[i % partnerIds.length],
        assignedAt: status === 'PENDING_ASSIGNMENT' ? null : daysFromNow(-2),
        arrivedAt:
          terminal || status === 'VERIFICATION_PENDING'
            ? daysFromNow(-1)
            : null,
        verifiedWeightKg: terminal
          ? round(quote.weightKg + random() * 0.6)
          : null,
        verifiedShipmentType: terminal
          ? (quote.shipmentType as Prisma.PickupRequestCreateInput['verifiedShipmentType'])
          : null,
        verifiedPrice: terminal ? round(estimatedPrice * 1.04) : null,
        verifiedAt: terminal ? daysFromNow(-1) : null,
        paymentMethod: terminal
          ? pick(['CASH', 'UPI', 'BANK_TRANSFER'] as const)
          : null,
        collectedAmount: terminal ? round(estimatedPrice * 1.04) : null,
        paymentReference: terminal ? `UPI-${100000 + i}` : null,
        paymentCollectedAt: terminal ? daysFromNow(-1) : null,
        parcelPackedProperly: terminal ? true : null,
        weightVerifiedFlag: terminal ? true : null,
        restrictedItemsChecked: terminal ? true : null,
        documentsVerified: terminal ? true : null,
        isFragile: terminal ? i % 5 === 0 : null,
        insuranceRequired: terminal ? i % 6 === 0 : null,
        rejectionReason:
          status === 'REJECTED'
            ? 'Parcel exceeded the declared weight by 4kg.'
            : null,
        createdAt: daysFromNow(-(3 + (i % 20))),
      },
    });
    created.push(request);
  }

  console.log(`Seeded ${created.length} demo pickup requests.`);
  return created;
}

async function seedOrders(
  pickupRequests: {
    id: string;
    customerId: string;
    quoteId: string;
    status: string;
    collectedAmount: number | null;
    paymentMethod: string | null;
  }[],
  customers: { id: string }[],
  shippingProviderId: string,
  adminId: string,
) {
  const completed = pickupRequests.filter((p) => p.status === 'COMPLETED');
  const statuses = ['CONFIRMED', 'COMPLETED', 'PENDING', 'CANCELLED'] as const;
  let created = 0;

  for (let i = 0; i < DEMO_SIZE; i++) {
    const source = completed[i];
    const customerId = source?.customerId ?? pick(customers).id;
    const status = source
      ? i % 2 === 0
        ? 'COMPLETED'
        : 'CONFIRMED'
      : pick(statuses);
    const createdAt = daysFromNow(-Math.floor(random() * 40));
    const paid = status !== 'PENDING' && status !== 'CANCELLED';
    const amount = source?.collectedAmount ?? round(2500 + random() * 12000);

    const order = await prisma.order.create({
      data: {
        customerId,
        status,
        paymentStatus: paid ? 'PAID' : 'PENDING',
        paymentMethod: paid
          ? ((source?.paymentMethod as Prisma.OrderCreateInput['paymentMethod']) ??
            pick(['CASH', 'UPI', 'BANK_TRANSFER'] as const))
          : null,
        paidAmount: paid ? amount : null,
        paidAt: paid ? createdAt : null,
        paymentMarkedByAdminId: paid ? adminId : null,
        createdAt,
        updatedAt: createdAt,
      },
    });

    if (source) {
      await prisma.pickupRequest.update({
        where: { id: source.id },
        data: { orderId: order.id },
      });
      await prisma.quote.update({
        where: { id: source.quoteId },
        data: { orderId: order.id, status: 'ACCEPTED' },
      });
    }

    if (status === 'CANCELLED') {
      created += 1;
      continue;
    }

    // Mirrors ShipmentsService.createForOrder: reserve the sequence, then format the number.
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId: shippingProviderId,
        sequenceNumber: await nextSequenceNumber(prisma),
        internalTrackingNumber: `PENDING-${order.id}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    const internalTrackingNumber = formatInternalTrackingNumber(
      shipment.sequenceNumber,
      createdAt,
    );

    const external = await prisma.externalTrackingNumber.create({
      data: {
        shipmentId: shipment.id,
        providerId: shippingProviderId,
        externalTrackingNumber: `ICL${String(700000 + i)}`,
        createdAt,
      },
    });

    // Every shipment walks the canonical flow; how far it got depends on its order status.
    const steps =
      status === 'COMPLETED'
        ? TRACKING_FLOW.length
        : 1 + Math.floor(random() * 3);
    const statusRows = await prisma.trackingStatus.findMany();
    const statusIdByCode = new Map(statusRows.map((s) => [s.code, s.id]));

    for (let step = 0; step < steps; step++) {
      const code = TRACKING_FLOW[step];
      const canonicalStatusId = statusIdByCode.get(code);
      if (!canonicalStatusId) continue;
      const eventTime = new Date(
        createdAt.getTime() + step * 22 * 60 * 60 * 1000,
      );
      await prisma.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          providerId: shippingProviderId,
          externalTrackingNumberId: external.id,
          rawStatus: code,
          canonicalStatusId,
          eventTime,
          location: pick(INDIAN_CITIES).city,
          createdAt: eventTime,
        },
      });
    }

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        internalTrackingNumber,
        currentStatus: TRACKING_FLOW[steps - 1],
        lastSyncedAt: createdAt,
      },
    });
    created += 1;
  }

  console.log(
    `Seeded ${created} demo orders with shipments and tracking history.`,
  );
}

// The Pickup model is the OTHER fulfillment path: a quote accepted with a fulfillmentMethod
// set, which creates an Order immediately (see the Quote.status doc comment). PickupRequest
// never produces one, so without these the admin's Pickups and Warehouse Drop-offs screens
// are empty however many pickup requests exist.
const PICKUP_PLAN: {
  method: 'PICKUP' | 'WAREHOUSE_DROP_OFF';
  status:
    | 'SCHEDULED'
    | 'PENDING'
    | 'ASSIGNED'
    | 'PICKUP_IN_PROGRESS'
    | 'PICKED_UP'
    | 'CANCELLED'
    | 'PICKUP_FAILED'
    | 'DROPPED_OFF';
}[] = [
  { method: 'PICKUP', status: 'SCHEDULED' },
  { method: 'PICKUP', status: 'SCHEDULED' },
  { method: 'PICKUP', status: 'SCHEDULED' },
  { method: 'PICKUP', status: 'ASSIGNED' },
  { method: 'PICKUP', status: 'ASSIGNED' },
  { method: 'PICKUP', status: 'ASSIGNED' },
  { method: 'PICKUP', status: 'PENDING' },
  { method: 'PICKUP', status: 'PICKUP_IN_PROGRESS' },
  { method: 'PICKUP', status: 'PICKUP_IN_PROGRESS' },
  { method: 'PICKUP', status: 'PICKED_UP' },
  { method: 'PICKUP', status: 'PICKED_UP' },
  { method: 'PICKUP', status: 'PICKED_UP' },
  { method: 'PICKUP', status: 'PICKED_UP' },
  { method: 'PICKUP', status: 'PICKED_UP' },
  { method: 'PICKUP', status: 'PICKUP_FAILED' },
  { method: 'PICKUP', status: 'CANCELLED' },
  { method: 'PICKUP', status: 'SCHEDULED' },
  { method: 'PICKUP', status: 'PICKED_UP' },
  { method: 'PICKUP', status: 'ASSIGNED' },
  { method: 'WAREHOUSE_DROP_OFF', status: 'PENDING' },
  { method: 'WAREHOUSE_DROP_OFF', status: 'PENDING' },
  { method: 'WAREHOUSE_DROP_OFF', status: 'DROPPED_OFF' },
  { method: 'WAREHOUSE_DROP_OFF', status: 'DROPPED_OFF' },
  { method: 'WAREHOUSE_DROP_OFF', status: 'DROPPED_OFF' },
  { method: 'WAREHOUSE_DROP_OFF', status: 'CANCELLED' },
];

async function seedLegacyPickups(
  customers: { id: string }[],
  team: { staffIds: string[]; partnerIds: string[] },
  adminId: string,
  shippingProviderId: string,
): Promise<void> {
  const statusRows = await prisma.trackingStatus.findMany();
  const statusIdByCode = new Map(statusRows.map((row) => [row.code, row.id]));
  const assignees = [...team.partnerIds, ...team.staffIds];
  let pickups = 0;
  let dropOffs = 0;

  for (let i = 0; i < PICKUP_PLAN.length; i++) {
    const plan = PICKUP_PLAN[i];
    const customer = customers[i % customers.length];
    const origin = pick(INDIAN_CITIES);
    const destination = pick(DESTINATIONS);
    const shipmentType = pick(SHIPMENT_TYPES);
    const weightKg = round(0.5 + random() * 9.5);
    const amount = round(2800 + random() * 13000);
    const createdAt = daysFromNow(-(2 + (i % 25)));
    const scheduledDate = daysFromNow(Math.floor(random() * 16) - 8);
    const collected =
      plan.status === 'PICKED_UP' || plan.status === 'DROPPED_OFF';

    // This path bills at acceptance, so the order exists from the start — unlike the
    // PickupRequest flow, where no Order exists until the partner accepts the parcel.
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        status:
          plan.status === 'CANCELLED'
            ? 'CANCELLED'
            : collected
              ? 'COMPLETED'
              : 'CONFIRMED',
        paymentStatus: collected ? 'PAID' : 'PENDING',
        paymentMethod: collected
          ? pick(['CASH', 'UPI', 'BANK_TRANSFER'] as const)
          : null,
        paidAmount: collected ? amount : null,
        paidAt: collected ? createdAt : null,
        paymentMarkedByAdminId: collected ? adminId : null,
        createdAt,
        updatedAt: createdAt,
      },
    });

    const quote = await prisma.quote.create({
      data: {
        customerId: customer.id,
        shipmentType,
        weightKg,
        description: pick(PARCEL_DESCRIPTIONS),
        originName: `Sender L${i + 1}`,
        originPhone: demoPhone(i),
        originAddressLine1: `${60 + i} Warehouse Lane`,
        originCity: origin.city,
        originState: origin.state,
        originPostalCode: origin.postalCode,
        originCountry: 'India',
        destName: `Receiver L${i + 1}`,
        destPhone: '+15550100300',
        destAddressLine1: `${80 + i} Harbour Road`,
        destCity: destination.city,
        destState: destination.state,
        destPostalCode: destination.postalCode,
        destCountry: destination.country,
        fulfillmentMethod: plan.method,
        pickupDate: plan.method === 'PICKUP' ? scheduledDate : null,
        pickupTimeSlot: plan.method === 'PICKUP' ? pick(TIME_SLOTS) : null,
        status: 'ACCEPTED',
        quotedAmount: amount,
        quotedByAdminId: adminId,
        quotedAt: createdAt,
        submissionKey: `demo-legacy-${createdAt.getTime()}-${i}`,
        orderId: order.id,
        createdAt,
        updatedAt: createdAt,
      },
    });

    await prisma.pickup.create({
      data: {
        quoteId: quote.id,
        orderId: order.id,
        method: plan.method,
        status: plan.status,
        scheduledDate: plan.method === 'PICKUP' ? scheduledDate : null,
        scheduledTimeSlot: plan.method === 'PICKUP' ? pick(TIME_SLOTS) : null,
        assignedStaffId:
          plan.status === 'PENDING' || plan.status === 'SCHEDULED'
            ? null
            : assignees[i % assignees.length],
        confirmedByAdminId: collected ? adminId : null,
        confirmedAt: collected ? scheduledDate : null,
        weightVerifiedKg: collected ? round(weightKg + random() * 0.5) : null,
        notes:
          plan.status === 'PICKUP_FAILED'
            ? 'Nobody at the address on two attempts; customer asked to reschedule.'
            : null,
        createdAt,
        updatedAt: createdAt,
      },
    });

    if (plan.method === 'PICKUP') pickups += 1;
    else dropOffs += 1;

    // Only a parcel we actually hold has a shipment moving.
    if (!collected) continue;

    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId: shippingProviderId,
        sequenceNumber: await nextSequenceNumber(prisma),
        internalTrackingNumber: `PENDING-${order.id}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    const external = await prisma.externalTrackingNumber.create({
      data: {
        shipmentId: shipment.id,
        providerId: shippingProviderId,
        externalTrackingNumber: `ICL${String(800000 + i)}`,
        createdAt,
      },
    });

    const steps = 2 + Math.floor(random() * (TRACKING_FLOW.length - 1));
    for (let step = 0; step < steps; step++) {
      const canonicalStatusId = statusIdByCode.get(TRACKING_FLOW[step]);
      if (!canonicalStatusId) continue;
      const eventTime = new Date(
        createdAt.getTime() + step * 20 * 60 * 60 * 1000,
      );
      await prisma.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          providerId: shippingProviderId,
          externalTrackingNumberId: external.id,
          rawStatus: TRACKING_FLOW[step],
          canonicalStatusId,
          eventTime,
          location: pick(INDIAN_CITIES).city,
          createdAt: eventTime,
        },
      });
    }

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        internalTrackingNumber: formatInternalTrackingNumber(
          shipment.sequenceNumber,
          createdAt,
        ),
        currentStatus: TRACKING_FLOW[steps - 1],
        lastSyncedAt: createdAt,
      },
    });
  }

  console.log(
    `Seeded ${pickups} scheduled pickups and ${dropOffs} warehouse drop-offs (with their orders and quotes).`,
  );
}

const NOTIFICATION_TEMPLATES = [
  'quote_ready',
  'pickup_scheduled',
  'pickup_completed',
  'shipment_dispatched',
  'shipment_out_for_delivery',
  'shipment_delivered',
  'payment_received',
];

async function seedNotifications(customers: { id: string }[]): Promise<void> {
  const channels = ['WHATSAPP', 'SMS', 'VOICE'] as const;
  const statuses = ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'] as const;

  for (let i = 0; i < DEMO_SIZE; i++) {
    const status = statuses[i % statuses.length];
    const sentAt = status === 'QUEUED' ? null : daysFromNow(-(i % 14));
    await prisma.notification.create({
      data: {
        customerId: customers[i % customers.length].id,
        channel: channels[i % channels.length],
        template: NOTIFICATION_TEMPLATES[i % NOTIFICATION_TEMPLATES.length],
        status,
        providerMessageId:
          status === 'QUEUED' ? null : `demo-msg-${Date.now()}-${i}`,
        errorMessage:
          status === 'FAILED'
            ? 'Recipient has not opted in to WhatsApp.'
            : null,
        sentAt,
        deliveredAt:
          status === 'DELIVERED' || status === 'READ' ? sentAt : null,
        readAt: status === 'READ' ? sentAt : null,
        createdAt: sentAt ?? new Date(),
      },
    });
  }
  console.log(`Seeded ${DEMO_SIZE} demo notifications.`);
}

async function seedAuditLogs(
  adminId: string,
  quotes: { id: string }[],
): Promise<void> {
  const actions = [
    {
      action: 'QUOTE_PRICED',
      entity: 'Quote',
      reason: 'Priced from the standard tariff.',
    },
    {
      action: 'RATE_UPDATED',
      entity: 'WeightSlab',
      reason: 'Quarterly fuel surcharge revision.',
    },
    {
      action: 'PROVIDER_UPDATED',
      entity: 'RateProvider',
      reason: 'PSS revised per carrier notice.',
    },
    {
      action: 'ORDER_PAYMENT_MARKED',
      entity: 'Order',
      reason: 'Cash collected at pickup.',
    },
    {
      action: 'PICKUP_ASSIGNED',
      entity: 'PickupRequest',
      reason: 'Assigned to the on-duty partner.',
    },
  ];

  for (let i = 0; i < DEMO_SIZE; i++) {
    const entry = actions[i % actions.length];
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: entry.action,
        entity: entry.entity,
        entityId: quotes[i % quotes.length].id,
        reason: entry.reason,
        after: { note: 'Demo seed entry' },
        createdAt: daysFromNow(-(i % 21)),
      },
    });
  }
  console.log(`Seeded ${DEMO_SIZE} demo audit log entries.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
