/**
 * Imports carrier tariffs — rate matrices AND the country-to-zone maps — from the rate workbook.
 *
 *   npm run db:import:tariffs --workspace=backend -- <path-to.xlsx> [--apply] [--only=FEDEX]
 *
 * Dry run by default: it parses, validates and prints exactly what it would write, and touches
 * nothing. Pass --apply to commit. That default is deliberate — this writes pricing, and a
 * mistake here is money quoted wrong to real customers.
 *
 * Supersedes import-fedex-tariff.ts, which handled one sheet and no zone mapping.
 *
 * THE ZONE MAP IS THE POINT. Rate cards alone are inert: PricingEngineService resolves a
 * destination through zone_countries, so with that table empty every quote returns
 * NO_RATE_AVAILABLE no matter how many rates exist. Each carrier's sheet carries its own
 * country-to-zone table further down the same sheet, which is what makes the rates reachable.
 *
 * Idempotent throughout — provider, zones, rate cards, slabs and country assignments are all
 * keyed on natural identifiers, so re-running after a tariff revision updates in place.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient, type RateType } from '@prisma/client';
import { readSheet } from './xlsx-reader';
import { buildCountryLookup, resolveCountry } from './country-matching';

const prisma = new PrismaClient();
const CURRENCY = 'INR';

interface CarrierConfig {
  providerCode: string;
  providerName: string;
  sheet: string;
  /** Cell text that starts a rate block, mapped to the RateCard.shipmentType it produces. */
  sections: Array<{ match: RegExp; shipmentType: 'DOCUMENT' | 'PACKAGE' }>;
  /** Header cell that marks the row carrying the zone column labels. */
  rateHeader: RegExp;
  /** Column index holding the weight for this sheet's rate rows. */
  weightColumn: number;
  /** Header text that marks the country-to-zone block. */
  countryHeader: RegExp;
  /** Turns a zone label from the rate header ("ZONE 3", "A") into the zone name we store. */
  zoneName: (label: string) => string | null;
}

const CARRIERS: CarrierConfig[] = [
  {
    providerCode: 'FEDEX',
    providerName: 'FedEx',
    sheet: 'Fedex IP',
    // The FedEx sheet's rate block is the International Priority package tariff; it has no
    // separate document table (that one lives only in the PDF).
    sections: [{ match: /^package$/i, shipmentType: 'PACKAGE' }],
    rateHeader: /^weight$/i,
    weightColumn: 1,
    countryHeader: /^destination$/i,
    // Single letters only — the header also carries trailing SERVICE/VENDOR columns.
    zoneName: (l) => (/^[A-Z]$/.test(l) ? l : null),
  },
  {
    providerCode: 'UPS',
    providerName: 'UPS',
    sheet: 'UPS Express Saver Basic',
    sections: [
      { match: /^ups document$/i, shipmentType: 'DOCUMENT' },
      { match: /^package$/i, shipmentType: 'PACKAGE' },
    ],
    rateHeader: /letter\s*\/?\s*document/i,
    weightColumn: 0,
    countryHeader: /^country$/i,
    zoneName: (l) => l.match(/^ZONE\s*(\d+)$/i)?.[1] ?? null,
  },
  {
    providerCode: 'DHL',
    providerName: 'DHL',
    sheet: 'DHL',
    sections: [
      { match: /^documents?\b/i, shipmentType: 'DOCUMENT' },
      { match: /^non-?documents?\b/i, shipmentType: 'PACKAGE' },
    ],
    rateHeader: /^kg$/i,
    weightColumn: 0,
    countryHeader: /^countries\s*&\s*territor/i,
    zoneName: (l) => l.match(/^Zone\s*(\d+)$/i)?.[1] ?? null,
  },
];

interface ParsedSlab {
  weightFromKg: number;
  weightToKg: number;
  rateType: RateType;
  shipmentType: 'DOCUMENT' | 'PACKAGE';
  rates: Record<string, number>;
}

/** "0.5" -> a flat step; "21-44 kgs" -> a per-kg band. Anything else is a note, not data. */
function parseWeight(
  raw: string,
  previousTo: number,
): { from: number; to: number; rateType: RateType } | null {
  const band = raw.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(kgs?)?$/i);
  if (band) {
    // Anchor to where the previous slab ended rather than the printed lower bound. The sheets
    // label bands "21-44" while the same tariff in the PDF reads "20-44"; taken literally that
    // leaves 20-21 kg matching no slab, and such a shipment gets no quote at all.
    return { from: previousTo, to: Number(band[2]), rateType: 'PER_KG' };
  }
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  // The sheets list the UPPER bound of each step. The lower bound is the previous row's upper,
  // which matches their own note that any fraction of a kilo rounds to the next step.
  return { from: previousTo, to: Number(raw), rateType: 'FLAT' };
}

interface ParsedCarrier {
  config: CarrierConfig;
  zones: string[];
  slabs: ParsedSlab[];
  countryZones: Array<{ country: string; zone: string }>;
  ignoredRows: number;
}

function parseCarrier(file: string, config: CarrierConfig): ParsedCarrier {
  const rows = readSheet(file, config.sheet);

  // Zone columns are re-read every time a header row appears rather than once at the top: DHL
  // repeats its "KG | Zone 1 | Zone 2 ..." header for each section, and a section marker can sit
  // ABOVE the first header ("Documents up to 2.0 kg" precedes it), so anchoring the scan to a
  // single header row silently dropped that whole table.
  let zoneColumns: Array<{ zone: string; index: number }> = [];

  function readZoneHeader(row: string[]): boolean {
    const found: Array<{ zone: string; index: number }> = [];
    row.forEach((cell, index) => {
      const zone = config.zoneName((cell ?? '').trim());
      if (zone) found.push({ zone, index });
    });
    if (found.length === 0) return false;
    zoneColumns = found;
    return true;
  }

  const slabs: ParsedSlab[] = [];
  const countryZones: Array<{ country: string; zone: string }> = [];
  let section: 'DOCUMENT' | 'PACKAGE' | null = null;
  let previousTo = 0;
  let ignoredRows = 0;

  // Column pairs for the country block, discovered from its header row: a "COUNTRY"/"Destination"
  // cell and the next "Zone" cell to its right form one pair, and the sheets repeat that pair
  // several times across the width to fit ~250 countries on one screen.
  let countryPairs: Array<{ country: number; zone: number }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.some(Boolean)) continue;

    // A rate header row: adopt its zone columns and move on.
    if (row.some((c) => config.rateHeader.test((c ?? '').trim())) && readZoneHeader(row)) {
      continue;
    }

    // A new country block header resets the pairs — FedEx prints the table twice.
    const headerCells = row
      .map((c, j) => ({ text: (c ?? '').trim(), j }))
      .filter((c) => c.text);
    if (headerCells.some((c) => config.countryHeader.test(c.text))) {
      countryPairs = [];
      const zoneCols = headerCells.filter((c) => /^zone$/i.test(c.text)).map((c) => c.j);
      for (const c of headerCells) {
        if (!config.countryHeader.test(c.text)) continue;
        const zoneCol = zoneCols.find((z) => z > c.j);
        if (zoneCol !== undefined) countryPairs.push({ country: c.j, zone: zoneCol });
      }
      continue;
    }

    if (countryPairs.length > 0) {
      let matched = false;
      for (const pair of countryPairs) {
        const country = (row[pair.country] ?? '').trim();
        const zone = (row[pair.zone] ?? '').trim();
        if (country && zone) {
          countryZones.push({ country, zone });
          matched = true;
        }
      }
      // Once past the country block the rows stop matching; the trailing terms-and-conditions
      // text is simply ignored rather than treated as data.
      if (matched) continue;
    }

    const first = (row[0] ?? '').trim();
    const sectionHit = config.sections.find((s) => s.match.test(first));
    if (sectionHit) {
      section = sectionHit.shipmentType;
      previousTo = 0; // each section restarts at zero
      continue;
    }

    const raw = (row[config.weightColumn] ?? '').trim();
    if (!raw || section === null || zoneColumns.length === 0) continue;
    const weight = parseWeight(raw, previousTo);
    if (!weight) {
      ignoredRows += 1;
      continue;
    }

    const rates: Record<string, number> = {};
    for (const { zone, index } of zoneColumns) {
      const value = Number((row[index] ?? '').replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) rates[zone] = value;
    }
    if (Object.keys(rates).length === 0) {
      ignoredRows += 1;
      continue;
    }

    slabs.push({
      weightFromKg: weight.from,
      weightToKg: weight.to,
      rateType: weight.rateType,
      shipmentType: section,
      rates,
    });
    previousTo = weight.to;
  }

  const allZones = [...new Set(slabs.flatMap((s) => Object.keys(s.rates)))].sort(
    (a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b),
  );

  return {
    config,
    zones: allZones,
    slabs,
    countryZones,
    ignoredRows,
  };
}

/**
 * Sheet country names are not database country names: they carry ISO codes ("Afghanistan (AF)"),
 * footnote markers ("Brazil *"), and parenthetical qualifiers ("Azores (Portugal)"). Matching is
 * therefore by ISO code first — exact and unambiguous where the sheet gives one — then by a
 * normalised name. Anything still unmatched is REPORTED, never guessed: a wrong country-to-zone
 * assignment quotes a real customer the wrong price.
 */

async function main(): Promise<void> {
  const [file, ...flags] = process.argv.slice(2);
  const apply = flags.includes('--apply');
  const only = flags.find((f) => f.startsWith('--only='))?.split('=')[1]?.toUpperCase();
  if (!file) throw new Error('Usage: import-tariffs <path-to.xlsx> [--apply] [--only=CODE]');
  readFileSync(file);

  const carriers = CARRIERS.filter((c) => !only || c.providerCode === only);
  const parsed = carriers.map((c) => parseCarrier(file, c));

  const lookup = buildCountryLookup(await prisma.country.findMany());

  for (const p of parsed) {
    const byType = new Map<string, number>();
    for (const s of p.slabs) {
      byType.set(s.shipmentType, (byType.get(s.shipmentType) ?? 0) + 1);
    }
    const points = p.slabs.reduce((n, s) => n + Object.keys(s.rates).length, 0);

    console.log(`\n${'='.repeat(64)}\n${p.config.providerCode}  (sheet: ${p.config.sheet})`);
    console.log(`  zones        ${p.zones.join(' ')}  (${p.zones.length})`);
    console.log(
      `  slabs        ${p.slabs.length}  [${[...byType].map(([k, v]) => `${k} ${v}`).join(', ')}]`,
    );
    console.log(`  rate points  ${points}`);
    console.log(`  ignored      ${p.ignoredRows} non-rate rows`);

    const resolved: Array<{ countryId: string; zone: string }> = [];
    const unmatched: string[] = [];
    const seen = new Set<string>();
    for (const cz of p.countryZones) {
      if (!p.zones.includes(cz.zone)) {
        unmatched.push(`${cz.country} -> zone ${cz.zone} (no such zone in the rate table)`);
        continue;
      }
      const hit = resolveCountry(cz.country, lookup);
      if (!hit) {
        unmatched.push(cz.country);
        continue;
      }
      // One zone per country per provider — the schema enforces it, and a country listed twice
      // in the sheet must not silently flip between zones depending on row order.
      if (seen.has(hit)) continue;
      seen.add(hit);
      resolved.push({ countryId: hit, zone: cz.zone });
    }

    console.log(
      `  countries    ${resolved.length} mapped, ${unmatched.length} unmatched of ${p.countryZones.length} listed`,
    );
    if (unmatched.length > 0) {
      console.log(`  UNMATCHED (left unassigned rather than guessed):`);
      for (const u of unmatched.slice(0, 12)) console.log(`     - ${u}`);
      if (unmatched.length > 12) console.log(`     ... and ${unmatched.length - 12} more`);
    }

    (p as ParsedCarrier & { resolved?: typeof resolved }).resolved = resolved;
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  const admin = await prisma.adminUser.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('No active ADMIN to attribute the import to.');

  for (const p of parsed) {
    const resolved =
      (p as ParsedCarrier & { resolved?: Array<{ countryId: string; zone: string }> }).resolved ??
      [];

    const provider = await prisma.rateProvider.upsert({
      where: { code: p.config.providerCode },
      update: {},
      create: { code: p.config.providerCode, name: p.config.providerName },
    });

    const zoneIds = new Map<string, string>();
    for (const zone of p.zones) {
      const row = await prisma.zone.upsert({
        where: { rateProviderId_name: { rateProviderId: provider.id, name: zone } },
        update: {},
        create: { rateProviderId: provider.id, name: zone },
      });
      zoneIds.set(zone, row.id);
    }

    let slabCount = 0;
    for (const [zone, zoneId] of zoneIds) {
      for (const shipmentType of ['DOCUMENT', 'PACKAGE'] as const) {
        const forType = p.slabs.filter(
          (s) => s.shipmentType === shipmentType && s.rates[zone] !== undefined,
        );
        if (forType.length === 0) continue;

        const card = await prisma.rateCard.upsert({
          where: { zoneId_shipmentType: { zoneId, shipmentType } },
          update: {},
          create: { zoneId, shipmentType, currency: CURRENCY, createdByAdminId: admin.id },
        });

        // Replace wholesale rather than diff: a tariff is one published table, and a partial
        // update can leave a stale slab from a previous edition still active and quotable.
        // Slabs already referenced by a quote cannot be deleted, so those are deactivated.
        await prisma.weightSlab.deleteMany({
          where: { rateCardId: card.id, rateQuoteOptions: { none: {} } },
        });
        await prisma.weightSlab.updateMany({
          where: { rateCardId: card.id },
          data: { isActive: false },
        });

        for (const slab of forType) {
          await prisma.weightSlab.create({
            data: {
              rateCardId: card.id,
              weightFromKg: slab.weightFromKg,
              weightToKg: slab.weightToKg,
              baseRate: slab.rates[zone],
              rateType: slab.rateType,
              // Not in the sheets. GST and the NationWide margin are commercial settings an
              // admin owns per rate — the sheets' own notes say "GST extra", i.e. not included.
              gstPercent: 0,
              nationwideCut: 0,
              createdByAdminId: admin.id,
            },
          });
          slabCount += 1;
        }
      }
    }

    let mapped = 0;
    for (const entry of resolved) {
      const zoneId = zoneIds.get(entry.zone);
      if (!zoneId) continue;
      await prisma.zoneCountry.upsert({
        where: {
          rateProviderId_countryId: {
            rateProviderId: provider.id,
            countryId: entry.countryId,
          },
        },
        update: { zoneId },
        create: { rateProviderId: provider.id, countryId: entry.countryId, zoneId },
      });
      mapped += 1;
    }

    console.log(
      `Applied ${p.config.providerCode}: ${zoneIds.size} zones, ${slabCount} slabs, ${mapped} countries mapped.`,
    );
  }
}

main()
  .catch((error: Error) => {
    console.error(`Tariff import failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
