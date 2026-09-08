/**
 * Imports the carriers' remote / out-of-delivery-area listings from the rate workbook.
 *
 *   npm run db:import:remote --workspace=backend -- <path-to.xlsx> [--apply]
 *
 * Dry run by default; --apply commits. Replace-by-source: every run deletes the rows it
 * previously wrote for each sheet before inserting, because carriers reissue these lists whole
 * and a merge would leave last year's postcodes still surcharged.
 *
 * NOT WIRED INTO PRICING. Loading the data and charging for it are separate decisions — the
 * amounts are per-carrier commercial terms, and applying them automatically would change every
 * quote to a remote destination without anyone choosing that.
 *
 * FOUR SHEETS ARE DELIBERATELY NOT IMPORTED, because their layout cannot be read without
 * guessing, and a wrong surcharge is worse than a missing one:
 *
 *   DHL REMOTE     a flowing multi-column postcode list where country headings and city names
 *                  share column 0 and codes spill across five more, so which country a given
 *                  code belongs to is positional and ambiguous.
 *   Fedex Remote   several independent country blocks laid side by side, each with its own
 *                  column layout, on one sheet.
 *   UAE Remote     bare place names with one free-text charge line ("25 DHIRAM per ..."), no
 *                  postal codes and no per-row amount.
 *   Self Remote    prose restrictions ("Medicine is not allowed"), not area data at all.
 *
 * The postcode-to-zone sheets (Australia Self Zone, New Zealand Zone, Canada Zone) are also out
 * of scope here: they assign a finer zone within a country rather than a surcharge, they do not
 * name which carrier they belong to, and they need their own model.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { readSheet } from './xlsx-reader';
import { buildCountryLookup, resolveCountry } from './country-matching';

const prisma = new PrismaClient();

interface SheetConfig {
  sheet: string;
  providerCode: string;
  /** Text in the header row that identifies it, so a shifted header does not break the import. */
  headerMatch: RegExp;
  /** Builds one row from a sheet row, given the resolved header column indexes. */
  extract: (
    row: string[],
    col: Record<string, number>,
  ) => {
    countryName: string;
    city?: string;
    postalCodeFrom?: string;
    postalCodeTo?: string;
    surchargeLabel?: string;
    originSurcharge?: string;
  } | null;
  /** Header labels to locate, lowercased. */
  columns: Record<string, RegExp>;
}

const SHEETS: SheetConfig[] = [
  {
    sheet: 'UPS Remote',
    providerCode: 'UPS',
    headerMatch: /^country$/i,
    columns: {
      country: /^country$/i,
      low: /^low$/i,
      high: /^high$/i,
      city: /^city$/i,
      origin: /^origin surcharge$/i,
      destination: /^destination surcharge$/i,
    },
    extract: (row, col) => {
      const countryName = (row[col.country] ?? '').trim();
      if (!countryName) return null;
      return {
        countryName,
        city: (row[col.city] ?? '').trim() || undefined,
        postalCodeFrom: (row[col.low] ?? '').trim() || undefined,
        postalCodeTo: (row[col.high] ?? '').trim() || undefined,
        surchargeLabel: (row[col.destination] ?? '').trim() || undefined,
        originSurcharge: (row[col.origin] ?? '').trim() || undefined,
      };
    },
  },
  {
    // Same columns as UPS Remote, published from a different hub — kept as its own source so the
    // two can be told apart and replaced independently.
    sheet: 'LHR UPS REMOTE',
    providerCode: 'UPS',
    headerMatch: /^country$/i,
    columns: {
      country: /^country$/i,
      low: /^low$/i,
      high: /^high$/i,
      city: /^city$/i,
      origin: /^origin surcharge$/i,
      destination: /^destination surcharge$/i,
    },
    extract: (row, col) => {
      const countryName = (row[col.country] ?? '').trim();
      if (!countryName) return null;
      return {
        countryName,
        city: (row[col.city] ?? '').trim() || undefined,
        postalCodeFrom: (row[col.low] ?? '').trim() || undefined,
        postalCodeTo: (row[col.high] ?? '').trim() || undefined,
        surchargeLabel: (row[col.destination] ?? '').trim() || undefined,
        originSurcharge: (row[col.origin] ?? '').trim() || undefined,
      };
    },
  },
  {
    sheet: 'SG FEDEX REMOTE',
    providerCode: 'FEDEX',
    headerMatch: /^country$/i,
    columns: {
      country: /^country$/i,
      city: /^city$/i,
      begin: /^begin postal code$/i,
      end: /^end postal code$/i,
      // Four tier columns (parcel/freight x out-of-pickup/out-of-delivery). The delivery tier is
      // the one that prices an outbound shipment, which is all this app sends.
      tier: /^international parcel/i,
    },
    extract: (row, col) => {
      const countryName = (row[col.country] ?? '').trim();
      if (!countryName) return null;
      return {
        countryName,
        city: (row[col.city] ?? '').trim() || undefined,
        postalCodeFrom: (row[col.begin] ?? '').trim() || undefined,
        postalCodeTo: (row[col.end] ?? '').trim() || undefined,
        surchargeLabel: (row[col.tier] ?? '').trim() || undefined,
      };
    },
  },
];

async function main(): Promise<void> {
  const [file, ...flags] = process.argv.slice(2);
  const apply = flags.includes('--apply');
  if (!file) throw new Error('Usage: import-remote-areas <path-to.xlsx> [--apply]');
  readFileSync(file);

  const lookup = buildCountryLookup(await prisma.country.findMany());

  const providers = await prisma.rateProvider.findMany();
  const providerIds = new Map(providers.map((p) => [p.code, p.id]));

  for (const config of SHEETS) {
    const rows = readSheet(file, config.sheet);

    const headerIndex = rows.findIndex((r) =>
      r.some((c) => config.headerMatch.test((c ?? '').trim())),
    );
    if (headerIndex < 0) {
      console.log(`${config.sheet}: header not found — skipped.`);
      continue;
    }

    const col: Record<string, number> = {};
    rows[headerIndex].forEach((cell, index) => {
      const text = (cell ?? '').trim();
      for (const [key, pattern] of Object.entries(config.columns)) {
        if (col[key] === undefined && pattern.test(text)) col[key] = index;
      }
    });

    const missing = Object.keys(config.columns).filter((k) => col[k] === undefined);
    // A missing optional column is fine; a missing country column means the layout moved and
    // the whole sheet would import as nulls.
    if (col.country === undefined) {
      console.log(`${config.sheet}: no country column — skipped.`);
      continue;
    }

    const providerId = providerIds.get(config.providerCode);
    if (!providerId) {
      console.log(`${config.sheet}: rate provider ${config.providerCode} not found — skipped.`);
      continue;
    }

    const parsed: Array<Record<string, unknown>> = [];
    let unmatchedCountries = 0;
    const unmatchedNames = new Set<string>();

    for (const row of rows.slice(headerIndex + 1)) {
      const item = config.extract(row, col);
      if (!item) continue;
      const countryId = resolveCountry(item.countryName, lookup);
      if (!countryId) {
        unmatchedCountries += 1;
        unmatchedNames.add(item.countryName);
      }
      parsed.push({
        rateProviderId: providerId,
        countryId,
        countryName: item.countryName,
        city: item.city ?? null,
        postalCodeFrom: item.postalCodeFrom ?? null,
        postalCodeTo: item.postalCodeTo ?? null,
        surchargeLabel: item.surchargeLabel ?? null,
        originSurcharge: item.originSurcharge ?? null,
        source: config.sheet,
      });
    }

    console.log(`\n${config.sheet}  (${config.providerCode})`);
    console.log(`  rows           ${parsed.length}`);
    console.log(
      `  countries      ${parsed.length - unmatchedCountries} resolved, ${unmatchedCountries} kept by name only (${unmatchedNames.size} distinct)`,
    );
    if (missing.length > 0) console.log(`  columns absent ${missing.join(', ')}`);
    if (unmatchedNames.size > 0) {
      console.log(`  unresolved     ${[...unmatchedNames].slice(0, 6).join(', ')}`);
    }

    if (!apply) continue;

    // Replace this source wholesale — carriers reissue these lists entire, and merging would
    // leave a postcode surcharged after it was removed from the published list.
    const removed = await prisma.remoteArea.deleteMany({ where: { source: config.sheet } });

    // Batched: a single createMany of 58k rows builds one enormous statement.
    const BATCH = 2000;
    for (let i = 0; i < parsed.length; i += BATCH) {
      await prisma.remoteArea.createMany({ data: parsed.slice(i, i + BATCH) as never });
    }
    console.log(`  applied        ${parsed.length} inserted, ${removed.count} replaced`);
  }

  if (!apply) console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
}

main()
  .catch((error: Error) => {
    console.error(`Remote-area import failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
