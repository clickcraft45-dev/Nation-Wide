/* One-off data import: UPS zones + Document/Package rates from the
 * "UPS_World First (Co-loader) All-in Special Rates (19-07-2026 to 25-07-2026)" sheet.
 * Run once with: node scripts/import-ups.js
 * Deletes and re-creates UPS's zones/rate cards each run so it is safe to re-run after fixing data.
 *
 * Zone shape is unlike FedEx/DHL: numbered zones 1-9 plus named single-country columns
 * (US, CA, AU, NZ, SG, DE), a shared "PL/CZ/RO/HU" column (Poland, Czech Republic, Romania,
 * Hungary priced identically), and two lettered zones 6A/7A.
 *
 * "UPS Envelope" (a single flat row with no weight column) is intentionally skipped in favor of
 * the full "UPS Document" table, which already starts at 0.5kg — same convention already used
 * for DHL's redundant single-row tables.
 */
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const prisma = new PrismaClient();

const { documentRows, packageRows, brackets } = require(path.join(__dirname, 'data/ups-tables.json'));
const countryZoneMap = require(path.join(__dirname, 'data/ups-country-zones.json'));

const ZONE_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'US', 'CA', 'AU', 'NZ', 'SG', 'PLCZROHU', 'DE', '6A', '7A'];

// Sheet codes that don't match our DB's ISO/synthetic codes directly.
const CODE_OVERRIDES = {
  A2: 'XZ', // "Azores (Portugal)" -> our DB's Azores code
  KO: 'XK2', // "Kosrae (Micronesia Federated States of)" -> our DB's Kosrae code
  B1: 'XB', // "Buesingen (Germany)" -> our DB's Büsingen code
  TA: 'XT', // "Tahiti (French Polynesia)" -> our DB's Tahiti code
  // NF "Norfolk Island", NB "Northern Ireland", WL "Wales" have no matching DB row — skipped.
};

// The sheet's country list doesn't include mainland China (it's covered separately by a
// postal-code split table for China vs China South); "excluding China South" is the larger
// region and shares the sheet's zone-3 column, so that's the single zone we use for China.
const EXTRA_COUNTRY_ZONE = { CN: '3' };

// UPS's own sheet mislabels Kosovo's zone code as "RS" (Serbia's code) in one row; both are
// zone 8 regardless, so this just makes the intent explicit for our Kosovo (XK) row.
const KOSOVO_ZONE = '8';

function slabsFromCheckpoints(checkpoints) {
  const rows = [];
  let prevWeight = 0;
  for (const { weight, rates } of checkpoints) {
    rows.push({ fromKg: prevWeight === 0 ? 0.01 : Number((prevWeight + 0.01).toFixed(2)), toKg: weight, rates });
    prevWeight = weight;
  }
  return rows;
}

function perKgSlabs(brackets) {
  const rows = [];
  for (const bracket of brackets) {
    for (let kg = bracket.fromKg; kg <= bracket.toKg; kg++) {
      const rates = {};
      for (const zone of ZONE_NAMES) rates[zone] = Math.round(bracket.rates[zone] * kg);
      rows.push({ fromKg: Number((kg - 1 + 0.01).toFixed(2)), toKg: kg, rates });
    }
  }
  return rows;
}

async function main() {
  const provider = await prisma.rateProvider.findFirst({ where: { code: 'UPS' } });
  if (!provider) throw new Error('UPS rate provider not found — seed it first.');
  const admin = await prisma.adminUser.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No ADMIN user found for createdByAdminId.');

  const countries = await prisma.country.findMany();
  const countryByCode = new Map(countries.map((c) => [c.code, c]));

  const existingZones = await prisma.zone.findMany({ where: { rateProviderId: provider.id } });
  const existingZoneIds = existingZones.map((z) => z.id);
  const existingCards = await prisma.rateCard.findMany({ where: { zoneId: { in: existingZoneIds } } });
  const existingCardIds = existingCards.map((c) => c.id);
  await prisma.rateQuoteOption.deleteMany({ where: { rateCardId: { in: existingCardIds } } });
  await prisma.weightSlab.deleteMany({ where: { rateCardId: { in: existingCardIds } } });
  await prisma.rateCard.deleteMany({ where: { id: { in: existingCardIds } } });
  await prisma.zoneCountry.deleteMany({ where: { rateProviderId: provider.id } });
  await prisma.zone.deleteMany({ where: { rateProviderId: provider.id } });

  const ZONE_LABELS = {
    '1': 'Zone 1', '2': 'Zone 2', '3': 'Zone 3', '4': 'Zone 4', '5': 'Zone 5', '6': 'Zone 6',
    '7': 'Zone 7', '8': 'Zone 8', '9': 'Zone 9', US: 'US', CA: 'Canada', AU: 'Australia',
    NZ: 'New Zealand', SG: 'Singapore', DE: 'Germany', PLCZROHU: 'PL / CZ / RO / HU', '6A': 'Zone 6A', '7A': 'Zone 7A',
  };
  const zoneByCode = new Map();
  for (const code of ZONE_NAMES) {
    const zone = await prisma.zone.create({ data: { rateProviderId: provider.id, name: ZONE_LABELS[code] } });
    zoneByCode.set(code, zone);
  }
  console.log(`Created ${zoneByCode.size} zones.`);

  const finalCountryZone = { ...countryZoneMap, ...EXTRA_COUNTRY_ZONE, XK: KOSOVO_ZONE };
  // Poland/Czech Republic/Romania/Hungary each have their own zone label in the sheet's country
  // list, but the rate table prices all four identically under one shared column.
  const PLCZROHU_ZONE_CODES = new Set(['PL', 'CZ', 'RO', 'HU']);

  let assigned = 0;
  const missing = [];
  for (const [rawCode, rawZoneCode] of Object.entries(finalCountryZone)) {
    const code = CODE_OVERRIDES[rawCode] || rawCode;
    const zoneCode = PLCZROHU_ZONE_CODES.has(rawZoneCode) ? 'PLCZROHU' : rawZoneCode;
    const country = countryByCode.get(code);
    if (!country) {
      missing.push(`${rawCode}`);
      continue;
    }
    const zone = zoneByCode.get(zoneCode);
    if (!zone) {
      console.log('Unknown zone code', zoneCode, 'for', rawCode);
      continue;
    }
    await prisma.zoneCountry.upsert({
      where: { rateProviderId_countryId: { rateProviderId: provider.id, countryId: country.id } },
      update: { zoneId: zone.id },
      create: { zoneId: zone.id, countryId: country.id, rateProviderId: provider.id },
    });
    assigned++;
  }
  console.log(`Assigned ${assigned} countries to zones.${missing.length ? ` Skipped (no DB match): ${missing.join(', ')}` : ''}`);

  async function createRateCard(zoneCode, shipmentType, slabRows) {
    const zone = zoneByCode.get(zoneCode);
    const card = await prisma.rateCard.create({
      data: { zoneId: zone.id, shipmentType, currency: 'INR', createdByAdminId: admin.id },
    });
    await prisma.weightSlab.createMany({
      data: slabRows.map((row) => ({
        rateCardId: card.id,
        weightFromKg: row.fromKg,
        weightToKg: row.toKg,
        baseRate: row.baseRate,
        pssAmount: 0,
        fuelChargePercent: 0,
        gstPercent: 18,
        nationwideCut: 0,
        createdByAdminId: admin.id,
      })),
    });
    return slabRows.length;
  }

  const documentSlabRows = slabsFromCheckpoints(documentRows); // 0.5-5kg
  const packageSlabRows = slabsFromCheckpoints(packageRows); // 0.5-20kg
  const bracketSlabRows = perKgSlabs(brackets); // 21-99kg per-kg brackets (100-299 bracket skipped, matches FedEx/DHL's cap)

  let docSlabs = 0;
  for (const zoneCode of ZONE_NAMES) {
    const rows = documentSlabRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneCode] }));
    docSlabs += await createRateCard(zoneCode, 'DOCUMENT', rows);
  }
  console.log(`Created DOCUMENT rate cards: ${docSlabs} slabs total.`);

  // PARCEL and PACKAGE: UPS's sheet only has one non-document table, so both shipment types share it.
  for (const shipmentType of ['PARCEL', 'PACKAGE']) {
    let slabs = 0;
    for (const zoneCode of ZONE_NAMES) {
      const rows = [
        ...packageSlabRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneCode] })),
        ...bracketSlabRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneCode] })),
      ];
      slabs += await createRateCard(zoneCode, shipmentType, rows);
    }
    console.log(`Created ${shipmentType} rate cards: ${slabs} slabs total.`);
  }

  console.log('UPS import complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
