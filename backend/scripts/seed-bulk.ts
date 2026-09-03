/**
 * Bulk demo-data generator — fills the database with a large, internally consistent dataset
 * (customers, quotes, priced options, pickup requests, orders, shipments, tracking, GST
 * invoices, notifications, audit logs) until `db.stats().dataSize` reaches a target size.
 *
 *   npx ts-node --transpile-only scripts/seed-bulk.ts [--mb=300] [--seed=42] [--reset]
 *
 * ADDITIVE, not a replacement for prisma/seed.ts: reference data (admin users, rate providers,
 * zones, rate cards, weight slabs, countries, company settings) must already exist — run
 * `npx prisma db push && npm run db:seed` first. This script only creates transactional rows on
 * top of it.
 *
 * Every number it writes goes through the same code the application uses — calculateFinalPrice
 * for pricing, resolveChargedBreakdown/splitGst/formatInvoiceNumber for invoices,
 * formatInternalTrackingNumber for tracking — so a seeded row is indistinguishable from one the
 * app produced. Sequence counters (`shipment`, `invoice:<FY>`) are written back, so the running
 * app carries on from where the seed stopped.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { calculateFinalPrice } from '../src/modules/pricing/pricing-engine.service';
import { formatInternalTrackingNumber } from '../src/modules/shipments/tracking-number';
import {
  formatInvoiceNumber,
  indianFinancialYear,
  resolveChargedBreakdown,
  round2,
  splitGst,
} from '../src/modules/invoices/gst';
import { gstStateCode, isIntraStateSupply } from '../src/modules/invoices/indian-states';
import { NOTIFICATION_TEMPLATES } from '../src/modules/notifications/templates';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

const TARGET_MB = Number(arg('mb', '300'));
const SEED = Number(arg('seed', '20260830'));
const RESET = process.argv.includes('--reset');
// One customer cohort per wave; the wave's date window marches forward through history so the
// dataset reads as organic growth and invoice numbers stay near-monotonic in date.
const CUSTOMERS_PER_WAVE = 400;
// Share of a wave's quote-generating owners that are customers from earlier waves rather than the
// wave's own new ones. Also the factor the calibration estimate has to be scaled by: the
// calibration wave runs against an empty pool, so it generates ~1/(1+ratio) of a real wave's rows
// per new customer.
const RETURNING_RATIO = 0.6;
const CALIBRATION_CUSTOMERS = 60;
const HISTORY_FROM = new Date('2025-04-02T00:00:00Z'); // FY 2025-26 onwards, so two FY series
const HISTORY_TO = new Date('2026-08-29T00:00:00Z');

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) — a re-run with the same --seed produces the same data.
// ---------------------------------------------------------------------------

let rngState = SEED >>> 0;
function rnd(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const float = (min: number, max: number) => min + rnd() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
const chance = (p: number) => rnd() < p;
/** weighted([['A', 0.7], ['B', 0.3]]) */
function weighted<T>(pairs: readonly (readonly [T, number])[]): T {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = rnd() * total;
  for (const [value, w] of pairs) {
    r -= w;
    if (r <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}
const dateBetween = (from: Date, to: Date) =>
  new Date(from.getTime() + rnd() * (to.getTime() - from.getTime()));
const plusHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const plusDays = (d: Date, days: number) => plusHours(d, days * 24);

// ---------------------------------------------------------------------------
// Name / place pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Aarav', 'Aadhya', 'Aditya', 'Akshay', 'Ananya', 'Anjali', 'Ankit', 'Arjun', 'Ayesha', 'Bhavna',
  'Chetan', 'Deepak', 'Divya', 'Farhan', 'Gaurav', 'Harsha', 'Ishaan', 'Isha', 'Jatin', 'Kavya',
  'Kiran', 'Lakshmi', 'Manish', 'Meera', 'Naveen', 'Neha', 'Nikhil', 'Pooja', 'Pranav', 'Priya',
  'Rahul', 'Rajesh', 'Ramya', 'Ravi', 'Rohit', 'Sahana', 'Sandeep', 'Sanjay', 'Shreya', 'Siddharth',
  'Sneha', 'Sridhar', 'Sunita', 'Suresh', 'Swati', 'Tanvi', 'Uday', 'Vandana', 'Varun', 'Vikram',
  'Vishal', 'Yamini', 'Zoya', 'Imran', 'Debjani', 'Harpreet', 'Aniket', 'Vignesh', 'Ritu', 'Nandini',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Reddy', 'Rao', 'Nair', 'Menon', 'Iyer', 'Gupta', 'Agarwal',
  'Joshi', 'Desai', 'Shah', 'Mehta', 'Kulkarni', 'Deshmukh', 'Kamble', 'Chatterjee', 'Banerjee', 'Roy',
  'Das', 'Bose', 'Singh', 'Kaur', 'Gill', 'Chauhan', 'Yadav', 'Mishra', 'Tiwari', 'Pandey',
  'Naidu', 'Prasad', 'Pillai', 'Raman', 'Krishnan', 'Bhat', 'Shetty', 'Gowda', 'Hegde', 'Qureshi',
  'Siddiqui', 'Khan', 'Ansari', 'Fernandes', 'Dsouza', 'Mathew', 'Thomas', 'Jain', 'Bhatia', 'Malhotra',
];
const COMPANY_SUFFIX = [
  'Exports Pvt Ltd', 'Traders', 'Global Logistics', 'Handicrafts', 'Textiles LLP', 'Enterprises',
  'Overseas Pvt Ltd', 'Impex', 'Agro Exports', 'Pharma Pvt Ltd', 'Electronics Pvt Ltd', 'Silks',
];

/** name, GST state name (must resolve via gstStateCode), 4-digit PIN prefix. */
const INDIAN_CITIES: readonly (readonly [string, string, string])[] = [
  ['Mumbai', 'Maharashtra', '4000'], ['Pune', 'Maharashtra', '4110'], ['Nagpur', 'Maharashtra', '4400'],
  ['New Delhi', 'Delhi', '1100'], ['Gurugram', 'Haryana', '1220'], ['Faridabad', 'Haryana', '1210'],
  ['Noida', 'Uttar Pradesh', '2013'], ['Lucknow', 'Uttar Pradesh', '2260'], ['Kanpur', 'Uttar Pradesh', '2080'],
  ['Bengaluru', 'Karnataka', '5600'], ['Mysuru', 'Karnataka', '5700'], ['Mangaluru', 'Karnataka', '5750'],
  ['Hyderabad', 'Telangana', '5000'], ['Secunderabad', 'Telangana', '5000'], ['Warangal', 'Telangana', '5060'],
  ['Visakhapatnam', 'Andhra Pradesh', '5300'], ['Vijayawada', 'Andhra Pradesh', '5200'],
  ['Chennai', 'Tamil Nadu', '6000'], ['Coimbatore', 'Tamil Nadu', '6410'], ['Madurai', 'Tamil Nadu', '6250'],
  ['Kochi', 'Kerala', '6820'], ['Thiruvananthapuram', 'Kerala', '6950'],
  ['Kolkata', 'West Bengal', '7000'], ['Siliguri', 'West Bengal', '7340'],
  ['Bhubaneswar', 'Odisha', '7510'], ['Guwahati', 'Assam', '7810'], ['Patna', 'Bihar', '8000'],
  ['Ranchi', 'Jharkhand', '8340'], ['Jaipur', 'Rajasthan', '3020'], ['Jodhpur', 'Rajasthan', '3420'],
  ['Ahmedabad', 'Gujarat', '3800'], ['Surat', 'Gujarat', '3950'], ['Rajkot', 'Gujarat', '3600'],
  ['Indore', 'Madhya Pradesh', '4520'], ['Bhopal', 'Madhya Pradesh', '4620'],
  ['Chandigarh', 'Chandigarh', '1600'], ['Ludhiana', 'Punjab', '1410'], ['Amritsar', 'Punjab', '1430'],
  ['Dehradun', 'Uttarakhand', '2480'], ['Raipur', 'Chhattisgarh', '4920'], ['Panaji', 'Goa', '4030'],
  ['Shimla', 'Himachal Pradesh', '1710'], ['Srinagar', 'Jammu and Kashmir', '1900'],
  ['Puducherry', 'Puducherry', '6050'], ['Agartala', 'Tripura', '7990'], ['Shillong', 'Meghalaya', '7930'],
];

const STREETS = [
  'MG Road', 'Nehru Street', 'Gandhi Nagar', 'Industrial Estate', 'Ring Road', 'Station Road',
  'Trade Centre', 'Park Avenue', 'Lake View Layout', 'Temple Street', 'Market Road', 'Sector 21',
  'Housing Board Colony', 'Old Bypass Road', 'Tech Park Phase 2', 'Bazaar Street',
];

/** Destination cities for the corridors that actually move volume; everything else falls back. */
const CITY_BY_COUNTRY: Record<string, readonly (readonly [string, string, string])[]> = {
  US: [['New York', 'NY', '10001'], ['Chicago', 'IL', '60601'], ['Dallas', 'TX', '75201'], ['San Jose', 'CA', '95101'], ['Edison', 'NJ', '08817']],
  GB: [['London', 'England', 'EC1A 1BB'], ['Birmingham', 'England', 'B1 1AA'], ['Leicester', 'England', 'LE1 1AA']],
  CA: [['Toronto', 'Ontario', 'M5H 2N2'], ['Brampton', 'Ontario', 'L6T 0G1'], ['Vancouver', 'BC', 'V6B 1A1']],
  AU: [['Sydney', 'NSW', '2000'], ['Melbourne', 'VIC', '3000'], ['Perth', 'WA', '6000']],
  AE: [['Dubai', 'Dubai', '00000'], ['Abu Dhabi', 'Abu Dhabi', '00000'], ['Sharjah', 'Sharjah', '00000']],
  SG: [['Singapore', 'Central', '018956']],
  MY: [['Kuala Lumpur', 'WP', '50000'], ['Johor Bahru', 'Johor', '80000']],
  DE: [['Frankfurt', 'Hessen', '60311'], ['Berlin', 'Berlin', '10115'], ['Munich', 'Bayern', '80331']],
  FR: [['Paris', 'Ile-de-France', '75001'], ['Lyon', 'Auvergne', '69001']],
  NZ: [['Auckland', 'Auckland', '1010'], ['Wellington', 'Wellington', '6011']],
  SA: [['Riyadh', 'Riyadh', '11564'], ['Jeddah', 'Makkah', '23442']],
  QA: [['Doha', 'Doha', '00000']],
  KW: [['Kuwait City', 'Al Asimah', '15300']],
  OM: [['Muscat', 'Muscat', '100']],
  JP: [['Tokyo', 'Kanto', '100-0001'], ['Osaka', 'Kansai', '530-0001']],
  ZA: [['Johannesburg', 'Gauteng', '2000'], ['Durban', 'KZN', '4001']],
  NL: [['Amsterdam', 'Noord-Holland', '1011 AA']],
  IT: [['Milan', 'Lombardia', '20121']],
  ES: [['Madrid', 'Madrid', '28001']],
  CH: [['Zurich', 'Zurich', '8001']],
  SE: [['Stockholm', 'Stockholm', '111 20']],
  IE: [['Dublin', 'Leinster', 'D01 F5P2']],
  NG: [['Lagos', 'Lagos', '100001']],
  KE: [['Nairobi', 'Nairobi', '00100']],
  LK: [['Colombo', 'Western', '00100']],
  NP: [['Kathmandu', 'Bagmati', '44600']],
  BD: [['Dhaka', 'Dhaka', '1000']],
  TH: [['Bangkok', 'Bangkok', '10100']],
  HK: [['Kowloon', 'Kowloon', '999077']],
  CN: [['Shanghai', 'Shanghai', '200000'], ['Shenzhen', 'Guangdong', '518000']],
};
const GENERIC_CITIES: readonly (readonly [string, string, string])[] = [
  ['Central District', 'Central', '10001'], ['Port Area', 'Coastal', '20002'], ['Riverside', 'North', '30003'],
  ['Old Town', 'South', '40004'], ['Harbour View', 'East', '50005'], ['Airport Road', 'West', '60006'],
];

const PARCEL_DESCRIPTIONS = [
  'Cotton garments (samples)', 'Handicrafts - brass figurines', 'Ayurvedic supplements', 'Spices, packed',
  'Legal documents', 'Silk sarees', 'Machine spare parts', 'Laptop accessories', 'Books and journals',
  'Wedding gifts', 'Pharmaceutical samples', 'Leather goods', 'Jewellery (declared)', 'Tea, loose leaf',
  'Personal effects', 'Contract originals', 'Textile swatches', 'Electronic components', 'Handloom fabric',
  'Educational transcripts', 'Ceramic tableware', 'Musical instrument (small)', 'Toys and games',
];
const PICKUP_INSTRUCTIONS: readonly (string | null)[] = [
  'Call before arriving; gate closes at 6pm.', 'Reception on the ground floor.',
  'Second gate, security will direct you.', 'Ring the bell twice.', 'Ask for the warehouse supervisor.',
  'Parking available in the basement.', 'Please carry a weighing scale.', null, null, null,
];
const TIME_SLOTS = ['09:00-12:00', '12:00-15:00', '15:00-18:00'] as const;

const TRACKING_LOCATIONS = [
  'Hyderabad Hub', 'Mumbai Gateway', 'Delhi Sorting Centre', 'Chennai Air Hub', 'Bengaluru Facility',
  'Dubai Transit', 'Frankfurt Hub', 'Singapore Transit', 'London Gateway', 'New York JFK Facility',
  'Local Delivery Centre', 'Customs Clearance Facility',
];

// The GSTIN check digit isn't validated anywhere in the app; the shape is what's stored, printed
// on the invoice, and used to decide B2B vs B2C.
function fakeGstin(stateCode: string): string {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letters = (n: number) => Array.from({ length: n }, () => L[int(0, 25)]).join('');
  const digits = (n: number) => Array.from({ length: n }, () => String(int(0, 9))).join('');
  return `${stateCode}${letters(3)}P${letters(1)}${digits(4)}${L[int(0, 25)]}1Z${L[int(0, 25)]}`;
}

// ---------------------------------------------------------------------------
// Reference data loaded once
// ---------------------------------------------------------------------------

interface Slab {
  id: string;
  weightFromKg: number;
  weightToKg: number;
  baseRate: number;
  gstPercent: number;
  nationwideCut: number;
}
interface Card {
  id: string;
  shipmentType: string;
  currency: string;
  slabs: Slab[];
}
interface Provider {
  id: string;
  code: string;
  name: string;
  fuelChargePercent: number;
  pssPerKg: number;
  /** countryId -> zoneId */
  zoneByCountry: Map<string, string>;
  /** `${zoneId}|${shipmentType}` -> Card */
  cardByZoneType: Map<string, Card>;
}

async function loadReference() {
  const [providers, zoneCountries, rateCards, countries, admins, statuses, iclProvider, settings] =
    await Promise.all([
      prisma.rateProvider.findMany({ where: { isActive: true } }),
      prisma.zoneCountry.findMany(),
      prisma.rateCard.findMany({
        include: {
          zone: { select: { rateProviderId: true } },
          weightSlabs: { where: { isActive: true } },
        },
      }),
      prisma.country.findMany({ where: { isActive: true } }),
      prisma.adminUser.findMany({ where: { isActive: true } }),
      prisma.trackingStatus.findMany(),
      prisma.shippingProvider.findFirst({ where: { code: 'ICL' } }),
      prisma.companySettings.findFirst(),
    ]);

  const missing = ['gstin', 'legalName', 'address', 'stateName', 'stateCode', 'sacCode'].filter(
    (f) => !settings?.[f as keyof typeof settings],
  );
  if (!settings || missing.length > 0) {
    throw new Error(
      `CompanySettings is missing ${missing.join(', ') || 'entirely'} — invoices cannot be issued. ` +
        'Run `npm run db:seed` first.',
    );
  }
  if (!iclProvider) throw new Error('No ICL shipping provider — run `npm run db:seed` first.');
  if (statuses.length === 0) throw new Error('No tracking statuses — run `npm run db:seed` first.');
  if (providers.length === 0 || rateCards.length === 0) {
    throw new Error('No rate providers / rate cards — the pricing data must be seeded first.');
  }

  const byId = new Map<string, Provider>(
    providers.map((p) => [
      p.id,
      {
        id: p.id,
        code: p.code,
        name: p.name,
        fuelChargePercent: p.fuelChargePercent,
        pssPerKg: p.pssPerKg,
        zoneByCountry: new Map<string, string>(),
        cardByZoneType: new Map<string, Card>(),
      },
    ]),
  );
  for (const zc of zoneCountries) {
    byId.get(zc.rateProviderId)?.zoneByCountry.set(zc.countryId, zc.zoneId);
  }
  for (const rc of rateCards) {
    if (rc.weightSlabs.length === 0) continue;
    byId.get(rc.zone.rateProviderId)?.cardByZoneType.set(`${rc.zoneId}|${rc.shipmentType}`, {
      id: rc.id,
      shipmentType: rc.shipmentType,
      currency: rc.currency,
      slabs: rc.weightSlabs.map((s) => ({
        id: s.id,
        weightFromKg: s.weightFromKg,
        weightToKg: s.weightToKg,
        baseRate: s.baseRate,
        gstPercent: s.gstPercent,
        nationwideCut: s.nationwideCut,
      })),
    });
  }

  // Only destinations at least one provider can actually price — otherwise every quote would land
  // in manual review and the dataset would say nothing about the pricing engine.
  const priceable = countries.filter((c) =>
    [...byId.values()].some((p) => p.zoneByCountry.has(c.id)),
  );

  return {
    providers: [...byId.values()],
    countries: priceable,
    adminIds: admins.filter((a) => a.role === 'ADMIN' || a.role === 'STAFF').map((a) => a.id),
    partnerIds: admins.filter((a) => a.role === 'PICKUP_PARTNER').map((a) => a.id),
    statusIdByCode: new Map(statuses.map((s) => [s.code, s.id])),
    iclProviderId: iclProvider.id,
    settings,
  };
}
type Reference = Awaited<ReturnType<typeof loadReference>>;

// ---------------------------------------------------------------------------
// Row buffers — one createMany per collection per wave.
// ---------------------------------------------------------------------------

class Rows {
  customers: any[] = [];
  quotes: any[] = [];
  rateQuoteOptions: any[] = [];
  pickupRequests: any[] = [];
  orders: any[] = [];
  pickups: any[] = [];
  shipments: any[] = [];
  externalTrackingNumbers: any[] = [];
  trackingEvents: any[] = [];
  invoices: any[] = [];
  notifications: any[] = [];
  auditLogs: any[] = [];
  apiRequestLogs: any[] = [];

  /** Parents before children: a crash mid-flush leaves no dangling references. */
  ordered(): [string, any[]][] {
    return [
      ['customer', this.customers],
      ['quote', this.quotes],
      ['rateQuoteOption', this.rateQuoteOptions],
      ['pickupRequest', this.pickupRequests],
      ['order', this.orders],
      ['pickup', this.pickups],
      ['shipment', this.shipments],
      ['externalTrackingNumber', this.externalTrackingNumbers],
      ['trackingEvent', this.trackingEvents],
      ['invoice', this.invoices],
      ['notification', this.notifications],
      ['auditLog', this.auditLogs],
      ['apiRequestLog', this.apiRequestLogs],
    ];
  }

  get count(): number {
    return this.ordered().reduce((n, [, rows]) => n + rows.length, 0);
  }
}

/**
 * Collections are written parents-first so a crash mid-flush leaves no dangling references, but
 * the batches WITHIN one collection go out concurrently — against a remote cluster this is pure
 * round-trip latency, and serialising it was the whole runtime.
 */
const BATCH = 1000;
const CONCURRENCY = 6;

async function flush(rows: Rows) {
  for (const [model, data] of rows.ordered()) {
    for (let i = 0; i < data.length; i += BATCH * CONCURRENCY) {
      const batches: any[][] = [];
      for (let j = i; j < Math.min(i + BATCH * CONCURRENCY, data.length); j += BATCH) {
        batches.push(data.slice(j, j + BATCH));
      }
      await Promise.all(
        batches.map((batch) => (prisma as any)[model].createMany({ data: batch })),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

interface CustomerRef {
  id: string;
  name: string;
  phone: string;
  address: string;
  gstin: string | null;
  city: readonly [string, string, string];
}

/** One real bcrypt hash of "ChangeMe123!", reused — hashing per row would dominate the runtime. */
let SHARED_PASSWORD_HASH = '';
let phoneCounter = 0;
let emailCounter = 0;

function makeCustomer(rows: Rows, createdAt: Date): CustomerRef {
  const city = pick(INDIAN_CITIES);
  const isBusiness = chance(0.28);
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const name = isBusiness ? `${last} ${pick(COMPANY_SUFFIX)}` : `${first} ${last}`;
  // Sequential, not random: Customer.phone is @unique and a collision across hundreds of
  // thousands of rows is a certainty, not a risk.
  const phone = `+9198${String(7_000_000 + phoneCounter++).padStart(8, '0')}`;
  const address = `${int(1, 240)}, ${pick(STREETS)}, ${city[0]} ${city[2]}${String(int(10, 99))}`;
  const gstin = isBusiness ? fakeGstin(gstStateCode(city[1]) ?? '36') : null;
  // Staff-entered customers legitimately have no email/password; only self-registered ones log in.
  const selfRegistered = chance(0.72);
  const id = randomUUID();
  const emailLocal = `${first}.${last}.${emailCounter++}`.toLowerCase().replace(/[^a-z0-9.]/g, '');

  rows.customers.push({
    id,
    name,
    phone,
    email: selfRegistered ? `${emailLocal}@example.com` : null,
    address,
    gstin,
    passwordHash: selfRegistered ? SHARED_PASSWORD_HASH : null,
    isActive: chance(0.97),
    consentGivenAt: plusHours(createdAt, -int(1, 48)),
    consentSource: selfRegistered ? 'signup_form' : 'staff_entry',
    createdAt,
    updatedAt: createdAt,
  });

  return { id, name, phone, address, gstin, city };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

interface ComputedOption {
  provider: Provider;
  card: Card;
  slab: Slab;
  breakdown: ReturnType<typeof calculateFinalPrice>;
}

function computeOptions(
  ref: Reference,
  countryId: string,
  shipmentType: string,
  weightKg: number,
): ComputedOption[] {
  const out: ComputedOption[] = [];
  for (const provider of ref.providers) {
    const zoneId = provider.zoneByCountry.get(countryId);
    if (!zoneId) continue;
    const card = provider.cardByZoneType.get(`${zoneId}|${shipmentType}`);
    if (!card) continue;
    const slab = card.slabs.find(
      (s) => weightKg >= s.weightFromKg && weightKg <= s.weightToKg,
    );
    if (!slab) continue;
    out.push({
      provider,
      card,
      slab,
      breakdown: calculateFinalPrice({
        baseRate: slab.baseRate,
        fuelChargePercent: provider.fuelChargePercent,
        pssPerKg: provider.pssPerKg,
        weightKg,
        gstPercent: slab.gstPercent,
        nationwideCut: slab.nationwideCut,
      }),
    });
  }
  return out;
}

/** Picks a weight that sits inside a real active slab, so most quotes actually price. */
function pickWeight(ref: Reference, countryId: string, shipmentType: string): number {
  for (const provider of ref.providers) {
    const zoneId = provider.zoneByCountry.get(countryId);
    const card = zoneId ? provider.cardByZoneType.get(`${zoneId}|${shipmentType}`) : undefined;
    if (!card || card.slabs.length === 0) continue;
    // Light parcels carry the volume in a real courier book, so bias towards the low slabs.
    const idx = Math.min(card.slabs.length - 1, Math.floor(Math.pow(rnd(), 2.2) * card.slabs.length));
    const slab = card.slabs[idx];
    return round2(float(slab.weightFromKg, Math.min(slab.weightToKg, slab.weightFromKg + 40)));
  }
  return round2(float(0.5, 25));
}

const destinationFor = (code: string) => pick(CITY_BY_COUNTRY[code] ?? GENERIC_CITIES);

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface WaveCounters {
  shipmentSeq: number;
  invoiceSeqByFy: Map<string, number>;
}
/** Invoices are numbered only once the whole wave exists, in date order — see numberInvoices. */
interface PendingInvoice {
  invoiceDate: Date;
  data: any;
}

function generateWave(
  ref: Reference,
  rows: Rows,
  counters: WaveCounters,
  customerCount: number,
  from: Date,
  to: Date,
  pool: CustomerRef[],
): PendingInvoice[] {
  const pendingInvoices: PendingInvoice[] = [];

  const fresh: CustomerRef[] = [];
  for (let i = 0; i < customerCount; i++) fresh.push(makeCustomer(rows, dateBetween(from, to)));

  const owners = fresh.slice();
  // Returning customers: without them every order in a window belongs to a brand-new account,
  // which no real book of business looks like.
  const returning = Math.min(pool.length, Math.round(customerCount * RETURNING_RATIO));
  for (let i = 0; i < returning; i++) owners.push(pick(pool));
  pool.push(...fresh);

  for (const customer of owners) {
    const quoteCount = weighted([[1, 0.42], [2, 0.26], [3, 0.16], [4, 0.09], [5, 0.05], [7, 0.02]] as const);
    for (let q = 0; q < quoteCount; q++) {
      generateQuoteChain(ref, rows, counters, customer, from, to, pendingInvoices);
    }
  }
  return pendingInvoices;
}

function generateQuoteChain(
  ref: Reference,
  rows: Rows,
  counters: WaveCounters,
  customer: CustomerRef,
  from: Date,
  to: Date,
  pendingInvoices: PendingInvoice[],
) {
  const createdAt = dateBetween(from, to);
  const shipmentType = weighted([
    ['PARCEL', 0.44], ['DOCUMENT', 0.28], ['PACKAGE', 0.24], ['OTHER', 0.04],
  ] as const);
  const country = pick(ref.countries);
  const [destCity, destState, destPostal] = destinationFor(country.code);
  const weightKg =
    shipmentType === 'OTHER'
      ? round2(float(30, 180))
      : pickWeight(ref, country.id, shipmentType);

  const options =
    shipmentType === 'OTHER' ? [] : computeOptions(ref, country.id, shipmentType, weightKg);
  const quoteId = randomUUID();

  const base: any = {
    id: quoteId,
    customerId: customer.id,
    shipmentType,
    weightKg,
    description: pick(PARCEL_DESCRIPTIONS),
    destName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    destPhone: `+1${int(200, 989)}${String(int(1000000, 9999999))}`,
    destAddressLine1: `${int(1, 900)} ${pick(['Market Street', 'Oak Avenue', 'King Road', 'Harbour Lane', 'Station Road'])}`,
    destAddressLine2: chance(0.3) ? `Apt ${int(1, 40)}${pick(['A', 'B', 'C', ''])}` : null,
    destCity,
    destState,
    destPostalCode: destPostal,
    destCountry: country.name,
    quotedCurrency: 'INR',
    submissionKey: `bulk-${quoteId}`,
    createdAt,
    updatedAt: createdAt,
  };

  if (options.length === 0) {
    generateManualQuote(
      ref, rows, counters, customer, base, createdAt, pendingInvoices,
      shipmentType === 'OTHER',
    );
    return;
  }

  // The engine's RATED path. Options are frozen snapshots, exactly as QuotesService.create writes.
  const optionRows = options.map((o) => ({
    id: randomUUID(),
    quoteId,
    rateProviderId: o.provider.id,
    rateCardId: o.card.id,
    weightSlabId: o.slab.id,
    currency: o.card.currency,
    ...o.breakdown,
    createdAt,
  }));
  rows.rateQuoteOptions.push(...optionRows);

  // Customers overwhelmingly take the cheapest option, but not always.
  const cheapestIdx = optionRows.reduce(
    (best, o, i) => (o.finalPrice < optionRows[best].finalPrice ? i : best),
    0,
  );
  const chosenIdx = chance(0.72) ? cheapestIdx : int(0, optionRows.length - 1);
  const chosen = optionRows[chosenIdx];
  const chosenProvider = options[chosenIdx].provider;

  base.optionsExpireAt = plusDays(createdAt, 7);

  const outcome = weighted([
    ['ACCEPTED', 0.6], ['PICKUP_REQUESTED', 0.07], ['PENDING_PICKUP_REQUEST', 0.05],
    ['RATED', 0.14], ['REJECTED', 0.07], ['CANCELLED', 0.07],
  ] as const);

  if (outcome === 'RATED' || outcome === 'REJECTED' || outcome === 'CANCELLED') {
    rows.quotes.push({
      ...base,
      status: outcome,
      // A RATED quote is one nobody has committed to yet, so it has no selected option.
      selectedOptionId: outcome === 'RATED' ? null : chosen.id,
      rejectionReason:
        outcome === 'REJECTED'
          ? pick([
              'Customer found a cheaper carrier',
              'Shipment no longer required',
              'Destination not serviceable on the requested date',
            ])
          : null,
      updatedAt: outcome === 'RATED' ? createdAt : plusHours(createdAt, int(2, 72)),
    });
    return;
  }

  // Committed: the customer picked a carrier and filed pickup logistics.
  const prCreatedAt = plusHours(createdAt, int(1, 30));
  const dropAtWarehouse = chance(0.18);
  const pickupCity = customer.city;
  const pickupRequestId = randomUUID();
  const pr: any = {
    id: pickupRequestId,
    quoteId,
    customerId: customer.id,
    rateProviderId: chosenProvider.id,
    rateProviderName: chosenProvider.name,
    shipmentType,
    estimatedWeightKg: weightKg,
    estimatedPrice: chosen.finalPrice,
    currency: 'INR',
    dropAtWarehouse,
    pickupContactName: customer.name,
    pickupContactPhone: customer.phone,
    pickupAddressLine1: `${int(1, 240)}, ${pick(STREETS)}`,
    pickupAddressLine2: chance(0.35) ? `Floor ${int(1, 12)}` : null,
    pickupCity: pickupCity[0],
    pickupState: pickupCity[1],
    pickupPostalCode: `${pickupCity[2]}${String(int(10, 99))}`,
    pickupDate: dropAtWarehouse ? null : plusDays(prCreatedAt, int(1, 4)),
    pickupTimeSlot: dropAtWarehouse ? null : pick(TIME_SLOTS),
    pickupInstructions: pick(PICKUP_INSTRUCTIONS),
    createdAt: prCreatedAt,
    updatedAt: prCreatedAt,
  };

  if (outcome === 'PENDING_PICKUP_REQUEST') {
    // Committed to a price, but no PickupRequest row exists yet — that is exactly what this
    // status means (see the QuoteStatus doc comment).
    rows.quotes.push({
      ...base,
      status: 'PENDING_PICKUP_REQUEST',
      selectedOptionId: chosen.id,
      updatedAt: prCreatedAt,
    });
    return;
  }

  const partnerId = pick(ref.partnerIds);
  const assignedAt = plusHours(prCreatedAt, int(1, 12));

  if (outcome === 'PICKUP_REQUESTED') {
    const status = weighted([
      ['PENDING_ASSIGNMENT', 0.2], ['ASSIGNED', 0.3], ['SCHEDULED', 0.2],
      ['OUT_FOR_PICKUP', 0.15], ['VERIFICATION_PENDING', 0.1], ['REJECTED', 0.05],
    ] as const);
    const assigned = status !== 'PENDING_ASSIGNMENT';
    rows.pickupRequests.push({
      ...pr,
      status,
      assignedPartnerId: assigned ? partnerId : null,
      assignedAt: assigned ? assignedAt : null,
      arrivedAt:
        status === 'OUT_FOR_PICKUP' || status === 'VERIFICATION_PENDING'
          ? plusHours(assignedAt, int(2, 30))
          : null,
      rejectionReason:
        status === 'REJECTED'
          ? pick([
              'Parcel not packed to standard',
              'Restricted item declared on arrival',
              'Customer unavailable after two attempts',
            ])
          : null,
      updatedAt: plusHours(assignedAt, int(1, 40)),
    });
    rows.quotes.push({
      ...base,
      status: 'PICKUP_REQUESTED',
      selectedOptionId: chosen.id,
      updatedAt: prCreatedAt,
    });
    rows.notifications.push(
      notification(customer.id, NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED, prCreatedAt),
    );
    if (assigned) {
      rows.notifications.push(
        notification(customer.id, NOTIFICATION_TEMPLATES.PICKUP_PARTNER_ASSIGNED, assignedAt),
      );
    }
    return;
  }

  // ---- ACCEPTED: the partner verified, collected payment, and generated the Order. ----
  const arrivedAt = plusHours(assignedAt, int(4, 40));
  const verifiedAt = plusHours(arrivedAt, int(0, 2));
  // A re-weigh on site rarely lands on exactly the customer's estimate.
  const verifiedWeightKg = round2(Math.max(0.05, weightKg * float(0.94, 1.16)));
  const reprice = computeOptions(ref, country.id, shipmentType, verifiedWeightKg).find(
    (o) => o.provider.id === chosenProvider.id,
  );
  // No slab covers the corrected weight -> the partner keeps the quoted price, same as the
  // service does when re-pricing yields nothing.
  const verified = reprice
    ? {
        verifiedTaxableSubtotal: reprice.breakdown.taxableSubtotal,
        verifiedGstPercent: reprice.breakdown.gstPercent,
        verifiedGstAmount: reprice.breakdown.gstAmount,
        verifiedNationwideCut: reprice.breakdown.nationwideCut,
        verifiedPrice: reprice.breakdown.finalPrice,
      }
    : {
        verifiedTaxableSubtotal: chosen.taxableSubtotal,
        verifiedGstPercent: chosen.gstPercent,
        verifiedGstAmount: chosen.gstAmount,
        verifiedNationwideCut: chosen.nationwideCut,
        verifiedPrice: chosen.finalPrice,
      };

  const paymentMethod = weighted([['UPI', 0.52], ['CASH', 0.3], ['BANK_TRANSFER', 0.18]] as const);
  const paidAt = plusHours(verifiedAt, int(0, 3));
  const orderId = randomUUID();
  const orderCreatedAt = plusHours(paidAt, int(0, 2));

  rows.pickupRequests.push({
    ...pr,
    status: 'COMPLETED',
    assignedPartnerId: partnerId,
    assignedAt,
    arrivedAt,
    verifiedWeightKg,
    verifiedShipmentType: shipmentType,
    ...verified,
    verificationNotes: chance(0.25)
      ? pick([
          'Weight differed from the estimate; customer informed.',
          'Repacked in a NationWide box.',
          'Fragile sticker applied.',
        ])
      : null,
    verifiedAt,
    paymentMethod,
    collectedAmount: verified.verifiedPrice,
    paymentReference:
      paymentMethod === 'CASH' ? null : `${paymentMethod === 'UPI' ? 'UPI' : 'NEFT'}-${int(100000, 999999)}`,
    paymentNotes: null,
    paymentCollectedAt: paidAt,
    parcelPackedProperly: true,
    weightVerifiedFlag: true,
    restrictedItemsChecked: true,
    documentsVerified: shipmentType === 'DOCUMENT' ? true : chance(0.7),
    isFragile: chance(0.22),
    insuranceRequired: chance(0.12),
    acceptanceRemarks: chance(0.2) ? 'Handled with care; customer requested photo proof.' : null,
    orderId,
    updatedAt: orderCreatedAt,
  });

  rows.quotes.push({
    ...base,
    status: 'ACCEPTED',
    selectedOptionId: chosen.id,
    orderId,
    updatedAt: orderCreatedAt,
  });

  const order = makeOrderAndShipment(ref, rows, counters, {
    orderId,
    customer,
    createdAt: orderCreatedAt,
    paymentMethod,
    paidAmount: verified.verifiedPrice,
    paidAt,
    weightKg: verifiedWeightKg,
  });

  rows.notifications.push(
    notification(customer.id, NOTIFICATION_TEMPLATES.PICKUP_VERIFICATION_COMPLETE, verifiedAt),
    notification(customer.id, NOTIFICATION_TEMPLATES.PAYMENT_COLLECTED, paidAt),
    notification(customer.id, NOTIFICATION_TEMPLATES.ORDER_CREATED_FROM_PICKUP, orderCreatedAt),
  );
  rows.auditLogs.push({
    id: randomUUID(),
    actorId: partnerId,
    action: 'PICKUP_REQUEST_COMPLETED',
    entity: 'PickupRequest',
    entityId: pickupRequestId,
    before: { status: 'VERIFICATION_PENDING' },
    after: { status: 'COMPLETED', orderId, collectedAmount: verified.verifiedPrice },
    reason: null,
    createdAt: orderCreatedAt,
  });

  queueInvoice(ref, rows, pendingInvoices, {
    orderId,
    customer,
    placeOfSupplyState: pr.pickupState,
    invoiceDate: plusHours(orderCreatedAt, int(1, 48)),
    breakdown: resolveChargedBreakdown({
      verified: {
        taxableSubtotal: verified.verifiedTaxableSubtotal,
        gstAmount: verified.verifiedGstAmount,
        nationwideCut: verified.verifiedNationwideCut,
        price: verified.verifiedPrice,
      },
      fallbackGstPercent: 18,
    }),
    orderCancelled: order.cancelled,
  });
}

/**
 * The legacy admin manual-quote path: no rate card could price it, so staff review it, type one
 * GST-inclusive gross amount, and a Pickup row (not a PickupRequest) records how the parcel
 * reached us.
 */
function generateManualQuote(
  ref: Reference,
  rows: Rows,
  counters: WaveCounters,
  customer: CustomerRef,
  base: any,
  createdAt: Date,
  pendingInvoices: PendingInvoice[],
  oversized: boolean,
) {
  const originCity = customer.city;
  const fulfillmentMethod = weighted([['PICKUP', 0.72], ['WAREHOUSE_DROP_OFF', 0.28]] as const);
  Object.assign(base, {
    originName: customer.name,
    originPhone: customer.phone,
    originAddressLine1: `${int(1, 240)}, ${pick(STREETS)}`,
    originAddressLine2: null,
    originCity: originCity[0],
    originState: originCity[1],
    originPostalCode: `${originCity[2]}${String(int(10, 99))}`,
    originCountry: 'India',
    originInstructions: pick(PICKUP_INSTRUCTIONS),
    fulfillmentMethod,
    pickupDate: fulfillmentMethod === 'PICKUP' ? plusDays(createdAt, int(1, 5)) : null,
    pickupTimeSlot: fulfillmentMethod === 'PICKUP' ? pick(TIME_SLOTS) : null,
    reviewReason: oversized
      ? weighted([['OVERSIZED', 0.6], ['SPECIAL_HANDLING', 0.25], ['DANGEROUS_GOODS', 0.15]] as const)
      : 'NO_RATE_AVAILABLE',
    internalNotes: chance(0.4)
      ? pick([
          'Priced off the Q3 partner sheet.',
          'Customer negotiated; approved by the ops head.',
          'Oversize surcharge included.',
        ])
      : null,
  });

  const outcome = weighted([
    ['ACCEPTED', 0.5], ['QUOTED', 0.2], ['NEEDS_MANUAL_REVIEW', 0.16], ['REJECTED', 0.14],
  ] as const);

  if (outcome === 'NEEDS_MANUAL_REVIEW') {
    rows.quotes.push({ ...base, status: 'NEEDS_MANUAL_REVIEW' });
    return;
  }

  const quotedByAdminId = pick(ref.adminIds);
  const quotedAt = plusHours(createdAt, int(2, 40));
  const quotedAmount = round2(float(1800, 46000));
  Object.assign(base, { quotedAmount, quotedByAdminId, quotedAt, updatedAt: quotedAt });

  rows.notifications.push(notification(customer.id, NOTIFICATION_TEMPLATES.QUOTE_READY, quotedAt));

  if (outcome !== 'ACCEPTED') {
    rows.quotes.push({
      ...base,
      status: outcome,
      rejectionReason:
        outcome === 'REJECTED'
          ? pick(['Price above budget', 'Customer shipped via another agent'])
          : null,
    });
    if (outcome === 'REJECTED') {
      rows.notifications.push(
        notification(customer.id, NOTIFICATION_TEMPLATES.QUOTE_REJECTED, plusHours(quotedAt, int(1, 48))),
      );
    }
    return;
  }

  const orderId = randomUUID();
  const acceptedAt = plusHours(quotedAt, int(1, 48));
  const confirmedAt = plusHours(acceptedAt, int(6, 72));

  rows.quotes.push({ ...base, status: 'ACCEPTED', orderId, updatedAt: acceptedAt });
  rows.pickups.push({
    id: randomUUID(),
    quoteId: base.id,
    orderId,
    method: fulfillmentMethod,
    status: fulfillmentMethod === 'PICKUP' ? 'PICKED_UP' : 'DROPPED_OFF',
    scheduledDate: base.pickupDate,
    scheduledTimeSlot: base.pickupTimeSlot,
    assignedStaffId: fulfillmentMethod === 'PICKUP' ? pick(ref.partnerIds) : null,
    confirmedByAdminId: quotedByAdminId,
    confirmedAt,
    weightVerifiedKg: round2(base.weightKg * float(0.95, 1.12)),
    notes: chance(0.3) ? 'Verified at the counter.' : null,
    createdAt: acceptedAt,
    updatedAt: confirmedAt,
  });
  rows.notifications.push(
    notification(customer.id, NOTIFICATION_TEMPLATES.PICKUP_CONFIRMED, confirmedAt),
  );

  const paymentMethod = weighted([['BANK_TRANSFER', 0.5], ['UPI', 0.3], ['CASH', 0.2]] as const);
  const order = makeOrderAndShipment(ref, rows, counters, {
    orderId,
    customer,
    createdAt: confirmedAt,
    paymentMethod,
    paidAmount: quotedAmount,
    paidAt: plusHours(confirmedAt, int(1, 60)),
    weightKg: base.weightKg,
  });

  queueInvoice(ref, rows, pendingInvoices, {
    orderId,
    customer,
    placeOfSupplyState: base.originState,
    invoiceDate: plusHours(confirmedAt, int(2, 72)),
    breakdown: resolveChargedBreakdown({ manualGrossAmount: quotedAmount, fallbackGstPercent: 18 }),
    orderCancelled: order.cancelled,
  });
}

// ---------------------------------------------------------------------------
// Order + shipment + tracking
// ---------------------------------------------------------------------------

/** How far a parcel has got depends on how long ago it shipped. */
function trackingChain(shippedAt: Date, now: Date): string[] {
  const ageDays = (now.getTime() - shippedAt.getTime()) / 86_400_000;
  const chain: string[] = ['PICKED_UP'];
  for (let i = 0, legs = int(1, 3); i < legs; i++) chain.push('IN_TRANSIT');
  if (chance(0.06)) chain.push('EXCEPTION');
  chain.push('OUT_FOR_DELIVERY', 'DELIVERED');

  if (ageDays > 12) return chain;
  if (ageDays > 8) return chance(0.85) ? chain : chain.slice(0, -1);
  if (ageDays > 5) return chain.slice(0, chain.length - int(1, 2));
  if (ageDays > 2) return chain.slice(0, 2 + int(0, 1));
  return chain.slice(0, 1 + int(0, 1));
}

function makeOrderAndShipment(
  ref: Reference,
  rows: Rows,
  counters: WaveCounters,
  input: {
    orderId: string;
    customer: CustomerRef;
    createdAt: Date;
    paymentMethod: string;
    paidAmount: number;
    paidAt: Date;
    weightKg: number;
  },
) {
  const { orderId, customer, createdAt } = input;
  const paid = chance(0.93);
  const markedBy = pick(ref.adminIds);

  const sequenceNumber = ++counters.shipmentSeq;
  const internalTrackingNumber = formatInternalTrackingNumber(sequenceNumber, createdAt);
  const shipmentId = randomUUID();
  const chain = trackingChain(createdAt, HISTORY_TO);
  const lastCode = chain[chain.length - 1];
  const delivered = lastCode === 'DELIVERED';

  const status = delivered
    ? 'COMPLETED'
    : weighted([['CONFIRMED', 0.85], ['PENDING', 0.12], ['CANCELLED', 0.03]] as const);

  rows.orders.push({
    id: orderId,
    customerId: customer.id,
    status,
    paymentStatus: paid
      ? 'PAID'
      : weighted([['PENDING', 0.8], ['FAILED', 0.15], ['REFUNDED', 0.05]] as const),
    paymentMethod: paid ? input.paymentMethod : null,
    paidAmount: paid ? input.paidAmount : null,
    paidAt: paid ? input.paidAt : null,
    paymentMarkedByAdminId: paid ? markedBy : null,
    createdAt,
    updatedAt: plusHours(createdAt, int(1, 200)),
  });

  if (paid) {
    rows.auditLogs.push({
      id: randomUUID(),
      actorId: markedBy,
      action: 'ORDER_PAYMENT_MARKED',
      entity: 'Order',
      entityId: orderId,
      before: { paymentStatus: 'PENDING', paidAmount: null },
      after: {
        paymentStatus: 'PAID',
        paidAmount: input.paidAmount,
        paymentMethod: input.paymentMethod,
      },
      reason: null,
      createdAt: input.paidAt,
    });
  }

  const lastSyncedAt = plusHours(createdAt, chain.length * 14);
  rows.shipments.push({
    id: shipmentId,
    orderId,
    internalTrackingNumber,
    sequenceNumber,
    providerId: ref.iclProviderId,
    currentStatus: lastCode,
    lastSyncedAt,
    createdAt,
    updatedAt: lastSyncedAt,
  });

  const externalId = randomUUID();
  const externalNumber = `ICL${String(int(10_000_000, 99_999_999))}IN`;
  rows.externalTrackingNumbers.push({
    id: externalId,
    shipmentId,
    providerId: ref.iclProviderId,
    externalTrackingNumber: externalNumber,
    rawMetadata: {
      service: pick(['EXPRESS', 'ECONOMY', 'PRIORITY']),
      pieces: int(1, 3),
      weightKg: input.weightKg,
    },
    createdAt,
  });

  let eventTime = plusHours(createdAt, int(1, 10));
  for (const code of chain) {
    eventTime = plusHours(eventTime, int(4, 30));
    const location = pick(TRACKING_LOCATIONS);
    const rawStatus = code.toLowerCase().replace(/_/g, '-');
    rows.trackingEvents.push({
      id: randomUUID(),
      shipmentId,
      providerId: ref.iclProviderId,
      externalTrackingNumberId: externalId,
      rawStatus,
      canonicalStatusId: ref.statusIdByCode.get(code)!,
      eventTime,
      location,
      rawPayload: {
        awb: externalNumber,
        status: rawStatus,
        location,
        scannedAt: eventTime.toISOString(),
        remarks:
          code === 'EXCEPTION'
            ? pick([
                'Address incomplete - clarification requested',
                'Held at customs for documentation',
                'Consignee unavailable',
              ])
            : null,
      },
      createdAt: eventTime,
    });
    rows.notifications.push(notification(customer.id, statusTemplate(code), eventTime));
  }

  rows.notifications.push(
    notification(customer.id, NOTIFICATION_TEMPLATES.ORDER_CONFIRMATION, createdAt),
    notification(customer.id, NOTIFICATION_TEMPLATES.TRACKING_NUMBER_ASSIGNED, plusHours(createdAt, 1)),
  );

  for (let i = 0, calls = int(1, 3); i < calls; i++) {
    const ok = chance(0.93);
    rows.apiRequestLogs.push({
      id: randomUUID(),
      providerId: ref.iclProviderId,
      shipmentId,
      requestUrl: `https://api.icl.example/v2/track/${externalNumber}`,
      requestPayload: { awb: externalNumber, includeHistory: true, client: 'nationwide-backend' },
      responseStatus: ok ? 200 : pick([429, 502, 504]),
      responsePayload: ok
        ? {
            awb: externalNumber,
            currentStatus: lastCode.toLowerCase().replace(/_/g, '-'),
            history: chain.map((c, idx) => ({
              status: c.toLowerCase().replace(/_/g, '-'),
              location: pick(TRACKING_LOCATIONS),
              scannedAt: plusHours(createdAt, (idx + 1) * 14).toISOString(),
            })),
          }
        : { error: 'upstream_unavailable', message: 'Provider did not respond in time' },
      latencyMs: ok ? int(120, 2400) : int(4000, 8000),
      createdAt: plusHours(createdAt, int(2, 240)),
    });
  }

  return { internalTrackingNumber, shipmentId, delivered, cancelled: status === 'CANCELLED' };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const STATUS_TEMPLATES: Record<string, string> = {
  PICKED_UP: NOTIFICATION_TEMPLATES.PICKED_UP,
  IN_TRANSIT: NOTIFICATION_TEMPLATES.IN_TRANSIT,
  OUT_FOR_DELIVERY: NOTIFICATION_TEMPLATES.OUT_FOR_DELIVERY,
  DELIVERED: NOTIFICATION_TEMPLATES.DELIVERED,
  EXCEPTION: NOTIFICATION_TEMPLATES.EXCEPTION,
};
const statusTemplate = (code: string) => STATUS_TEMPLATES[code] ?? NOTIFICATION_TEMPLATES.IN_TRANSIT;

let messageCounter = 0;
function notification(customerId: string, template: string, at: Date) {
  const status = weighted([
    ['READ', 0.42], ['DELIVERED', 0.34], ['SENT', 0.14], ['FAILED', 0.06], ['QUEUED', 0.04],
  ] as const);
  const sent = status !== 'QUEUED' && status !== 'FAILED';
  return {
    id: randomUUID(),
    customerId,
    channel: weighted([['WHATSAPP', 0.82], ['SMS', 0.15], ['VOICE', 0.03]] as const),
    template,
    status,
    // @unique — a counter, not a random string, so it cannot collide at this volume.
    providerMessageId: status === 'QUEUED' ? null : `gs-seed-${messageCounter++}`,
    errorMessage:
      status === 'FAILED'
        ? pick(['Recipient not on WhatsApp', 'Template paused by provider', 'Rate limited'])
        : null,
    sentAt: sent ? at : null,
    deliveredAt: status === 'DELIVERED' || status === 'READ' ? plusHours(at, 0.1) : null,
    readAt: status === 'READ' ? plusHours(at, int(1, 20)) : null,
    createdAt: at,
  };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

function queueInvoice(
  ref: Reference,
  rows: Rows,
  pending: PendingInvoice[],
  input: {
    orderId: string;
    customer: CustomerRef;
    placeOfSupplyState: string;
    invoiceDate: Date;
    breakdown: ReturnType<typeof resolveChargedBreakdown>;
    orderCancelled: boolean;
  },
) {
  // A cancelled order is not a supply and must never be invoiced — the same rule
  // InvoicesService.generateForRange enforces with `status: { not: 'CANCELLED' }`.
  if (input.orderCancelled) return;
  // Not every order is invoiced the moment it ships, and a few never get invoiced at all — an
  // "uninvoiced orders" list that is always empty tests nothing.
  if (!input.breakdown || !chance(0.86)) return;

  const s = ref.settings;
  const placeOfSupplyCode = gstStateCode(input.placeOfSupplyState) ?? s.stateCode!;
  const split = splitGst(
    input.breakdown.taxableValue,
    input.breakdown.gstAmount,
    isIntraStateSupply(s.stateCode, placeOfSupplyCode),
  );
  const cancelled = chance(0.03);

  pending.push({
    invoiceDate: input.invoiceDate,
    data: {
      id: randomUUID(),
      orderId: input.orderId,
      customerId: input.customer.id,
      customLineDescription: null,
      status: cancelled ? 'CANCELLED' : 'ISSUED',
      invoiceDate: input.invoiceDate,

      supplierName: s.legalName!,
      supplierGstin: s.gstin!,
      supplierAddress: s.address!,
      supplierStateName: s.stateName!,
      supplierStateCode: s.stateCode!,
      supplierEmail: s.supportEmail,
      supplierPhone: s.supportPhone,

      recipientName: input.customer.name,
      recipientPhone: input.customer.phone,
      recipientGstin: input.customer.gstin,
      recipientAddress: input.customer.address,

      placeOfSupplyState: input.placeOfSupplyState,
      placeOfSupplyCode,
      sacCode: s.sacCode!,

      currency: 'INR',
      taxableValue: input.breakdown.taxableValue,
      ...split,
      nonTaxableCharges: input.breakdown.nonTaxableCharges,
      totalAmount: input.breakdown.totalAmount,
      breakdownSource: input.breakdown.source,
      // No PDF: rendering one file per invoice would add gigabytes to the S3 bucket for demo data.
      // List, filters, totals and detail all work; only "Download PDF" 404s, exactly as it does
      // for any invoice whose file is missing.
      pdfPath: null,
      sentAt: cancelled ? null : plusHours(input.invoiceDate, int(1, 30)),
      cancelledAt: cancelled ? plusHours(input.invoiceDate, int(24, 400)) : null,
      cancellationReason: cancelled
        ? pick([
            'Raised against the wrong order',
            'Customer GSTIN corrected - reissued',
            'Duplicate of an earlier invoice',
          ])
        : null,
      issuedByAdminId: pick(ref.adminIds),
      createdAt: input.invoiceDate,
      updatedAt: input.invoiceDate,
    },
  });
}

/**
 * Numbers the wave's invoices in date order, per financial year. Deferred to the end of the wave
 * because the series must run in the same order as the supplies it bills, and the chains are
 * generated customer by customer, not chronologically.
 */
function numberInvoices(
  rows: Rows,
  counters: WaveCounters,
  pending: PendingInvoice[],
  adminIds: string[],
) {
  pending.sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime());
  for (const { invoiceDate, data } of pending) {
    const financialYear = indianFinancialYear(invoiceDate);
    const next = (counters.invoiceSeqByFy.get(financialYear) ?? 0) + 1;
    counters.invoiceSeqByFy.set(financialYear, next);
    data.financialYear = financialYear;
    data.sequenceNumber = next;
    data.invoiceNumber = formatInvoiceNumber(next, financialYear);
    rows.invoices.push(data);

    rows.auditLogs.push({
      id: randomUUID(),
      actorId: data.issuedByAdminId ?? pick(adminIds),
      action: 'INVOICE_ISSUED',
      entity: 'Invoice',
      entityId: data.id,
      before: {},
      after: {
        invoiceNumber: data.invoiceNumber,
        orderId: data.orderId,
        totalAmount: data.totalAmount,
        breakdownSource: data.breakdownSource,
      },
      reason: null,
      createdAt: invoiceDate,
    });
    rows.notifications.push(
      notification(data.customerId, NOTIFICATION_TEMPLATES.INVOICE_READY, plusHours(invoiceDate, 1)),
    );
  }
}

// ---------------------------------------------------------------------------
// Counters, size, reset
// ---------------------------------------------------------------------------

async function persistCounters(counters: WaveCounters) {
  await prisma.counter.upsert({
    where: { id: 'shipment' },
    update: { value: counters.shipmentSeq },
    create: { id: 'shipment', value: counters.shipmentSeq },
  });
  for (const [fy, value] of counters.invoiceSeqByFy) {
    await prisma.counter.upsert({
      where: { id: `invoice:${fy}` },
      update: { value },
      create: { id: `invoice:${fy}`, value },
    });
  }
}

async function dbSizeMb() {
  // pg_database_size is the real on-disk figure and drives the calibration loop, so it has to be
  // exact. `objects` is only ever printed for progress: n_live_tup is a planner estimate refreshed
  // by autovacuum, so it lags mid-load and is not worth a COUNT(*) over every table to sharpen.
  const [row] = await prisma.$queryRaw<
    { bytes: bigint; indexes: bigint; objects: bigint }[]
  >`
    SELECT pg_database_size(current_database())                       AS bytes,
           COALESCE((SELECT SUM(pg_indexes_size(relid))
                     FROM pg_stat_user_tables), 0)                    AS indexes,
           COALESCE((SELECT SUM(n_live_tup) FROM pg_stat_user_tables), 0) AS objects
  `;
  const mb = (n: bigint | number) => Number(n) / 1_048_576;
  const total = mb(row.bytes);
  return {
    data: total - mb(row.indexes),
    storage: total,
    index: mb(row.indexes),
    objects: Number(row.objects),
  };
}

/** Clears only what this script writes; reference data (rates, countries, admins) is left alone. */
async function reset() {
  const models = [
    'apiRequestLog', 'trackingEvent', 'externalTrackingNumber', 'shipment', 'invoice',
    'notification', 'auditLog', 'pickup', 'pickupRequest', 'order', 'rateQuoteOption',
    'quote', 'customer',
  ];
  for (const model of models) {
    // Quote.selectedOption <-> RateQuoteOption.quote is a reference cycle, and MongoDB emulates
    // referential actions in the Prisma client — so the options can only be deleted once no quote
    // still points at one. Same for orderId, whose orders are already gone by this point.
    if (model === 'rateQuoteOption') {
      await prisma.quote.updateMany({ data: { selectedOptionId: null, orderId: null } });
    }
    const { count } = await (prisma as any)[model].deleteMany({});
    console.log(`  cleared ${count} ${model}`);
  }
  await prisma.counter.deleteMany({ where: { id: { startsWith: 'invoice:' } } });
  await prisma.counter.upsert({
    where: { id: 'shipment' },
    update: { value: 0 },
    create: { id: 'shipment', value: 0 },
  });
}

// ---------------------------------------------------------------------------

async function main() {
  const bcrypt = await import('bcrypt');
  SHARED_PASSWORD_HASH = await bcrypt.hash('ChangeMe123!', 10);

  if (RESET) {
    console.log('Resetting transactional data (reference data untouched)...');
    await reset();
  }

  const ref = await loadReference();
  console.log(
    `Reference: ${ref.providers.length} rate providers, ${ref.countries.length} priceable countries, ` +
      `${ref.adminIds.length} staff, ${ref.partnerIds.length} pickup partners.`,
  );

  const existingCounters = await prisma.counter.findMany();
  const counters: WaveCounters = {
    shipmentSeq: existingCounters.find((c) => c.id === 'shipment')?.value ?? 0,
    invoiceSeqByFy: new Map(
      existingCounters
        .filter((c) => c.id.startsWith('invoice:'))
        .map((c) => [c.id.slice('invoice:'.length), c.value] as [string, number]),
    ),
  };
  // Rows the counters don't already cover (a partial run, an import) would collide on the unique
  // invoice number, so start above whatever is actually in the collection.
  const seenPerFy = await prisma.invoice.groupBy({
    by: ['financialYear'],
    _max: { sequenceNumber: true },
  });
  for (const fy of seenPerFy) {
    const seen = fy._max.sequenceNumber ?? 0;
    if (seen > (counters.invoiceSeqByFy.get(fy.financialYear) ?? 0)) {
      counters.invoiceSeqByFy.set(fy.financialYear, seen);
    }
  }
  const maxShipmentSeq = (await prisma.shipment.aggregate({ _max: { sequenceNumber: true } }))._max
    .sequenceNumber;
  if (maxShipmentSeq && maxShipmentSeq > counters.shipmentSeq) counters.shipmentSeq = maxShipmentSeq;

  const before = await dbSizeMb();
  console.log(
    `Start: ${before.data.toFixed(1)} MB data / ${before.objects.toLocaleString()} docs. Target: ${TARGET_MB} MB.`,
  );

  const pool: CustomerRef[] = [];
  const started = Date.now();
  let current = before;

  // Calibration wave: measures MB-per-customer against the real cluster instead of guessing, so
  // the date windows for the remaining waves can be planned up front and the dataset reads as
  // steady growth from HISTORY_FROM to HISTORY_TO.
  const calibrationEnd = plusDays(HISTORY_FROM, 10);
  {
    const rows = new Rows();
    const pending = generateWave(
      ref, rows, counters, CALIBRATION_CUSTOMERS, HISTORY_FROM, calibrationEnd, pool,
    );
    numberInvoices(rows, counters, pending, ref.adminIds);
    await flush(rows);
    await persistCounters(counters);
    current = await dbSizeMb();
    console.log(
      `Calibration: +${(current.data - before.data).toFixed(2)} MB from ${CALIBRATION_CUSTOMERS} ` +
        `customers (${rows.count.toLocaleString()} docs).`,
    );
  }

  const mbPerCustomer =
    Math.max(0.001, (current.data - before.data) / CALIBRATION_CUSTOMERS) * (1 + RETURNING_RATIO);
  const customersNeeded = Math.max(1, Math.ceil((TARGET_MB - current.data) / mbPerCustomer));
  const totalWaves = Math.max(1, Math.ceil(customersNeeded / CUSTOMERS_PER_WAVE));
  console.log(
    `Estimated ${customersNeeded.toLocaleString()} more customers ` +
      `(~${mbPerCustomer.toFixed(4)} MB each) over ${totalWaves} waves.`,
  );

  const windowStart = calibrationEnd.getTime();
  const windowSpan = (HISTORY_TO.getTime() - windowStart) / totalWaves;
  let wave = 0;

  while (current.data < TARGET_MB) {
    const from = new Date(windowStart + Math.min(wave, totalWaves - 1) * windowSpan);
    const to = new Date(windowStart + Math.min(wave + 1, totalWaves) * windowSpan);
    // Sized down as the target comes into view, so the run lands near TARGET_MB instead of
    // overshooting by a whole wave.
    const size = Math.max(
      20,
      Math.min(CUSTOMERS_PER_WAVE, Math.ceil((TARGET_MB - current.data) / mbPerCustomer)),
    );
    const rows = new Rows();
    const pending = generateWave(ref, rows, counters, size, from, to, pool);
    numberInvoices(rows, counters, pending, ref.adminIds);
    await flush(rows);
    await persistCounters(counters);

    wave++;
    current = await dbSizeMb();
    console.log(
      `wave ${String(wave).padStart(3)}/${totalWaves}  ` +
        `${from.toISOString().slice(0, 10)}->${to.toISOString().slice(0, 10)}  ` +
        `+${rows.count.toLocaleString()} docs  ` +
        `${current.data.toFixed(1)}/${TARGET_MB} MB  ` +
        `${current.objects.toLocaleString()} docs  ` +
        `${((Date.now() - started) / 1000).toFixed(0)}s`,
    );

    if (wave > totalWaves * 4 + 20) {
      console.warn('Stopping: far more waves than estimated — the cluster may be rejecting writes.');
      break;
    }
  }

  const models = [
    'customer', 'quote', 'rateQuoteOption', 'pickupRequest', 'pickup', 'order', 'shipment',
    'trackingEvent', 'invoice', 'notification', 'auditLog', 'apiRequestLog',
  ];
  const counts = await Promise.all(
    models.map(async (m) => ({ collection: m, count: await (prisma as any)[m].count() })),
  );
  console.log();
  console.log(`Done in ${((Date.now() - started) / 60000).toFixed(1)} min.`);
  console.log(
    `data ${current.data.toFixed(1)} MB | storage ${current.storage.toFixed(1)} MB | ` +
      `indexes ${current.index.toFixed(1)} MB | ${current.objects.toLocaleString()} docs`,
  );
  console.table(counts);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
