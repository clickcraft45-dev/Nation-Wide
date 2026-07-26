/* One-off data import: DHL zones + Document/Parcel/Package rates from the
 * "DHL_World First (Co-loader) All-in Rates (w.e.f., 19-07-2026 to 25-07-2026)" sheet.
 * Run once with: node scripts/import-dhl.js
 * Deletes and re-creates DHL's zones/rate cards each run so it is safe to re-run after fixing data.
 *
 * Table shape on the sheet:
 *  - "Documents up to 2.0 KG": weights 0.5-2kg -> DOCUMENT rates.
 *  - "Non-documents from 0.5 KG & Documents from 2.5 KG": weights 0.5-20kg (0.5 steps) then
 *    21-30kg (1kg steps) -> shared rates for PARCEL, PACKAGE, and (from 2.5kg on) DOCUMENT too.
 *    This produces DHL's real 2.0-2.5kg Document gap (no rows in that range) rather than inventing one.
 *  - "Multiplier rate per 1 KG from 30.1 KG": three per-kg brackets (30.1-50, 50.1-70, 70.1-100).
 *    Expanded into 1kg-wide slabs (baseRate = perKgRate * weight), matching the per-kg-as-given
 *    approach used for FedEx's own top brackets, capped at 100kg (DHL's own table stops giving
 *    granular data beyond that here; heavier shipments fall to manual review).
 */
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const prisma = new PrismaClient();

const tables = require(path.join(__dirname, 'data/dhl-tables.json'));
const parsedZones = require(path.join(__dirname, 'data/dhl-zones.json'));

const ZONE_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '9A'];

// Codes in the sheet that don't match our DB's ISO/synthetic codes directly.
const CODE_OVERRIDES = {
  XE: 'XA', // "St. Eustatius" -> our DB row uses XA
  XN: 'KN', // "Nevis" -> folded into "Saint Kitts and Nevis"
  KV: 'XK', // "Kosovo" -> our DB's synthetic Kosovo code
  // FK "Falkland Islands" has no matching DB row at all (not in the seeded 246-country list) — skipped.
};

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
    const from = Math.floor(bracket.fromKg); // 30.1 -> 30
    for (let kg = from + 1; kg <= bracket.toKg; kg++) {
      const rates = {};
      for (const zone of ZONE_NAMES) rates[zone] = Math.round(bracket.rates[zone] * kg);
      rows.push({ fromKg: Number((kg - 1 + 0.01).toFixed(2)), toKg: kg, rates });
    }
  }
  return rows;
}

async function main() {
  const provider = await prisma.rateProvider.findFirst({ where: { code: 'DHL' } });
  if (!provider) throw new Error('DHL rate provider not found — seed it first.');
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

  const zoneByName = new Map();
  for (const name of ZONE_NAMES) {
    const zone = await prisma.zone.create({ data: { rateProviderId: provider.id, name: `Zone ${name}` } });
    zoneByName.set(name, zone);
  }
  console.log(`Created ${zoneByName.size} zones.`);

  let assigned = 0;
  const missing = [];
  for (const entry of parsedZones) {
    const code = CODE_OVERRIDES[entry.code] || entry.code;
    const country = countryByCode.get(code);
    if (!country) {
      missing.push(`${entry.name} (${entry.code})`);
      continue;
    }
    const zone = zoneByName.get(entry.zone);
    await prisma.zoneCountry.upsert({
      where: { rateProviderId_countryId: { rateProviderId: provider.id, countryId: country.id } },
      update: { zoneId: zone.id },
      create: { zoneId: zone.id, countryId: country.id, rateProviderId: provider.id },
    });
    assigned++;
  }
  console.log(`Assigned ${assigned} countries to zones.${missing.length ? ` Skipped (no DB match): ${missing.join(', ')}` : ''}`);

  async function createRateCard(zoneName, shipmentType, slabRows) {
    const zone = zoneByName.get(zoneName);
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

  const table1Rows = slabsFromCheckpoints(tables.table1); // 0.5-2kg, Document only
  const table2Rows = slabsFromCheckpoints(tables.table2); // 0.5-20kg (0.5 step) + 21-30kg (1kg step)
  const multiplierRows = perKgSlabs(tables.multiplier); // 30.1-100kg per-kg brackets

  // Document rows from 2.5kg on are re-anchored to start exactly at 2.5 (not table2's own 2.01
  // checkpoint) so the sheet's real 2.0-2.5kg Document gap is preserved rather than papered over.
  const table2From25 = tables.table2.filter((r) => r.weight >= 2.5);
  const docFrom25Rows = table2From25.map((r, idx) => ({
    fromKg: idx === 0 ? r.weight : Number((table2From25[idx - 1].weight + 0.01).toFixed(2)),
    toKg: r.weight,
    rates: r.rates,
  }));

  // DOCUMENT: table1 (0.5-2kg) directly, then the re-anchored 2.5kg+ rows (real gap 2.0-2.5kg preserved),
  // then the same 30.1-100kg multiplier brackets.
  let docSlabs = 0;
  for (const zoneName of ZONE_NAMES) {
    const rows = [
      ...table1Rows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneName] })),
      ...docFrom25Rows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneName] })),
      ...multiplierRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneName] })),
    ];
    docSlabs += await createRateCard(zoneName, 'DOCUMENT', rows);
  }
  console.log(`Created DOCUMENT rate cards: ${docSlabs} slabs total.`);

  // PARCEL and PACKAGE: DHL doesn't distinguish between the two, so both get table2 + multiplier verbatim.
  for (const shipmentType of ['PARCEL', 'PACKAGE']) {
    let slabs = 0;
    for (const zoneName of ZONE_NAMES) {
      const rows = [
        ...table2Rows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneName] })),
        ...multiplierRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[zoneName] })),
      ];
      slabs += await createRateCard(zoneName, shipmentType, rows);
    }
    console.log(`Created ${shipmentType} rate cards: ${slabs} slabs total.`);
  }

  console.log('DHL import complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
