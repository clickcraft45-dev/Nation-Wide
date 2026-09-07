/**
 * Imports the FedEx zone x weight tariff from the rate workbook.
 *
 *   npm run db:import:fedex --workspace=backend -- <path-to.xlsx> [--apply]
 *
 * Dry run by default: it parses, validates and prints exactly what it would write, and touches
 * nothing. Pass --apply to commit. That default is deliberate — this writes pricing, and a
 * mistake here is money quoted wrong to real customers.
 *
 * Idempotent: provider, zones, rate cards and slabs are all keyed on natural identifiers, so a
 * second run updates in place rather than duplicating. Re-running after the sheet is revised is
 * the intended way to apply a new tariff.
 *
 * WHAT IT DOES NOT DO: assign countries to zones. That mapping is not in this sheet, and the one
 * in the FedEx PDF is character-fragmented ("So u th Afr ica") in a way that cannot be read back
 * reliably. Until an admin assigns countries at /admin/pricing/zones, the quote engine will
 * correctly return no rate rather than a guessed one.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient, type RateType } from '@prisma/client';
import { readSheet } from './xlsx-reader';

const prisma = new PrismaClient();

const PROVIDER_CODE = 'FEDEX';
const PROVIDER_NAME = 'FedEx';
const SHEET = 'Fedex IP';
// The sheet is the International Priority *package* tariff; the document tariff is a separate
// table in the PDF and is not imported here.
const SHIPMENT_TYPE = 'PACKAGE';
const CURRENCY = 'INR';

interface ParsedSlab {
  weightFromKg: number;
  weightToKg: number;
  rateType: RateType;
  rates: Record<string, number>;
}

/** "0.5" -> a flat slab; "21-44" -> a per-kg band. Anything else is a note row, not data. */
function parseWeight(
  raw: string,
  previousTo: number,
): { from: number; to: number; rateType: RateType } | null {
  const band = raw.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (band) {
    // The lower bound comes from where the previous slab ended, not from the label. The sheet
    // labels its bands "21-44" and "45-70" while the same tariff in the PDF reads "20-44" —
    // taken literally the labels leave 20-21 kg and 44-45 kg with no slab at all, and a
    // shipment landing in one of those gaps would get no quote rather than a price. Anchoring
    // to previousTo makes the tariff continuous and matches the PDF.
    return {
      from: previousTo,
      to: Number(band[2]),
      rateType: 'PER_KG',
    };
  }
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const to = Number(raw);
  // The sheet lists the UPPER bound of each step (0.5, 1, 1.5...). The lower bound is whatever
  // the previous row ended at, so a 0.7 kg shipment lands in the "1" slab — which matches the
  // sheet's own note that any fraction of a kilo is rounded to the next step up.
  return { from: previousTo, to, rateType: 'FLAT' };
}

async function main(): Promise<void> {
  const [file, ...flags] = process.argv.slice(2);
  const apply = flags.includes('--apply');
  if (!file) {
    throw new Error('Usage: import-fedex-tariff <path-to.xlsx> [--apply]');
  }
  readFileSync(file); // fail early and clearly if the path is wrong

  const rows = readSheet(file, SHEET);

  // Header row carries the zone letters; everything before it is notes.
  const headerIndex = rows.findIndex((r) => r[1]?.toLowerCase() === 'weight');
  if (headerIndex < 0) {
    throw new Error(`Could not find the header row in sheet "${SHEET}"`);
  }
  const header = rows[headerIndex];
  const zoneColumns: { zone: string; index: number }[] = [];
  for (let i = 2; i < header.length; i += 1) {
    const label = (header[i] ?? '').trim();
    // Single letters only: the row also carries trailing "SERVICE"/"VENDOR" columns.
    if (/^[A-Z]$/.test(label)) zoneColumns.push({ zone: label, index: i });
  }
  if (zoneColumns.length === 0) throw new Error('No zone columns found');

  const slabs: ParsedSlab[] = [];
  const skipped: string[] = [];
  let previousTo = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const raw = (row[1] ?? '').trim();
    if (!raw) continue;
    const weight = parseWeight(raw, previousTo);
    if (!weight) {
      skipped.push(raw.slice(0, 60));
      continue;
    }
    const rates: Record<string, number> = {};
    for (const { zone, index } of zoneColumns) {
      const value = Number((row[index] ?? '').replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) rates[zone] = value;
    }
    if (Object.keys(rates).length === 0) {
      skipped.push(`${raw} (no rates on the row)`);
      continue;
    }
    slabs.push({ ...weight, weightFromKg: weight.from, weightToKg: weight.to, rates });
    previousTo = weight.to;
  }

  const flat = slabs.filter((s) => s.rateType === 'FLAT').length;
  const perKg = slabs.filter((s) => s.rateType === 'PER_KG').length;
  const points = slabs.reduce((n, s) => n + Object.keys(s.rates).length, 0);

  console.log(`Sheet:      ${SHEET}`);
  console.log(`Zones:      ${zoneColumns.map((z) => z.zone).join(' ')} (${zoneColumns.length})`);
  console.log(`Slabs:      ${slabs.length}  (${flat} flat, ${perKg} per-kg)`);
  console.log(`Rate points:${points}`);
  console.log(
    `Weight:     ${slabs[0]?.weightFromKg} -> ${slabs[slabs.length - 1]?.weightToKg} kg`,
  );
  console.log(`Ignored:    ${skipped.length} non-rate rows (notes, surcharges, headings)`);

  console.log('\nSpot check — verify these against the sheet before applying:');
  for (const s of [slabs[0], slabs[1], slabs[slabs.length - 2], slabs[slabs.length - 1]]) {
    if (!s) continue;
    const unit = s.rateType === 'PER_KG' ? '/kg' : ' flat';
    console.log(
      `  ${String(s.weightFromKg).padStart(5)} - ${String(s.weightToKg).padEnd(5)} kg   ` +
        `A=${s.rates.A}${unit}   N=${s.rates.N}${unit}`,
    );
  }

  // A gap means a shipment matching no slab, which surfaces as "no rate" rather than a price.
  const sorted = [...slabs].sort((a, b) => a.weightFromKg - b.weightFromKg);
  const gaps = sorted
    .slice(1)
    .map((s, i) =>
      s.weightFromKg > sorted[i].weightToKg
        ? `${sorted[i].weightToKg}-${s.weightFromKg}kg`
        : '',
    )
    .filter(Boolean);
  console.log(
    `Coverage:   ${gaps.length === 0 ? 'continuous, no gaps' : `GAPS: ${gaps.join(', ')}`}`,
  );

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  // RateCard.createdByAdminId is required and is a real audit field, so the import is attributed
  // to an actual admin rather than a synthetic one.
  const admin = await prisma.adminUser.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    throw new Error('No active ADMIN to attribute the import to — seed one first.');
  }

  const provider = await prisma.rateProvider.upsert({
    where: { code: PROVIDER_CODE },
    update: {},
    create: { code: PROVIDER_CODE, name: PROVIDER_NAME },
  });

  let cards = 0;
  let written = 0;
  for (const { zone, index } of zoneColumns) {
    const zoneRow = await prisma.zone.upsert({
      where: { rateProviderId_name: { rateProviderId: provider.id, name: zone } },
      update: {},
      create: { rateProviderId: provider.id, name: zone },
    });

    const card = await prisma.rateCard.upsert({
      where: { zoneId_shipmentType: { zoneId: zoneRow.id, shipmentType: SHIPMENT_TYPE } },
      update: {},
      create: {
        zoneId: zoneRow.id,
        shipmentType: SHIPMENT_TYPE,
        currency: CURRENCY,
        createdByAdminId: admin.id,
      },
    });
    cards += 1;

    // Replace this card's slabs wholesale rather than diffing: the tariff is a single published
    // table, and a partial update could leave a stale slab from a previous edition still active
    // and quotable. Slabs referenced by an existing quote option cannot be deleted, so those are
    // deactivated instead of removed.
    const existing = await prisma.weightSlab.findMany({
      where: { rateCardId: card.id },
      select: { id: true },
    });
    if (existing.length > 0) {
      await prisma.weightSlab.deleteMany({
        where: {
          rateCardId: card.id,
          rateQuoteOptions: { none: {} },
        },
      });
      await prisma.weightSlab.updateMany({
        where: { rateCardId: card.id },
        data: { isActive: false },
      });
    }

    for (const slab of slabs) {
      const rate = slab.rates[zone];
      if (rate === undefined) continue;
      await prisma.weightSlab.create({
        data: {
          rateCardId: card.id,
          weightFromKg: slab.weightFromKg,
          weightToKg: slab.weightToKg,
          baseRate: rate,
          rateType: slab.rateType,
          // Not in the sheet. GST and the NationWide margin are commercial settings an admin
          // owns per rate, so they start at zero rather than being invented here — the sheet's
          // own note says "18% GST extra", i.e. it is not part of these figures.
          gstPercent: 0,
          nationwideCut: 0,
          createdByAdminId: admin.id,
        },
      });
      written += 1;
    }
  }

  console.log(`\nApplied: provider ${PROVIDER_CODE}, ${cards} rate cards, ${written} slabs.`);
  console.log('Next: assign countries to zones at /admin/pricing/zones — until then the quote');
  console.log('engine returns no rate for a destination, which is correct rather than guessed.');
}

main()
  .catch((error: Error) => {
    console.error(`FedEx tariff import failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
