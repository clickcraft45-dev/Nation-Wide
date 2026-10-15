import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Country } from '@prisma/client';
import { listSheets, readSheetFromBuffer } from '../../common/xlsx/xlsx-reader';
import { detectRateTables } from './rate-sheet-detect';
import {
  buildPlan,
  CountryMatcher,
  pickTables,
  sheetView,
} from './rate-sheet-import.service';

const WORKBOOK = join(
  __dirname,
  '../../../../docs/15th_July_2026_Mumbai_GST_atlantic_international_SELF_rates_DHL_FEDEX.xlsx',
);
// The same country list the seed writes, so names match what production holds.
const COUNTRIES = (
  JSON.parse(
    readFileSync(
      join(__dirname, '../../../prisma/data/countries.json'),
      'utf8',
    ),
  ) as { code: string; name: string }[]
).map((c) => ({ id: c.code, code: c.code, name: c.name }) as Country);

const buf = readFileSync(WORKBOOK);
const tables = listSheets(buf).flatMap((sheet) =>
  detectRateTables(sheet, readSheetFromBuffer(buf, sheet)),
);
const plan = buildPlan(
  tables.filter((t) => t.suggested),
  new CountryMatcher(COUNTRIES),
);
const zone = (provider: string, name: string) =>
  plan.providers.get(provider)?.zones.get(name.toLowerCase());
const zoneOf = (provider: string, countryCode: string) =>
  [...(plan.providers.get(provider)?.zones.values() ?? [])].find((z) =>
    z.countries.has(countryCode),
  )?.name;

describe('buildPlan on the real rate book', () => {
  it("links countries to the carrier's zones from its own zone list", () => {
    expect(zoneOf('DHL', 'AF')).toBe('Zone 11');
    expect(zoneOf('FEDEX', 'AW')).toBe('J');
    // A column for the country itself beats the zone the list puts it in.
    expect(zoneOf('UPS', 'AU')).toBe('AU');
  });

  it('joins a grid and its per-kg continuation into one rate card with no gap', () => {
    const bands = zone('DHL', 'Zone 1')!.cards.get('PACKAGE')!;
    const at30 = bands.findIndex((b) => b.weightToKg === 30);
    expect(bands[at30 + 1]).toMatchObject({
      weightFromKg: 30.01,
      weightToKg: 50,
      rateType: 'PER_KG',
    });
  });

  it('trusts the destination name over a wrong code, and a code only when the name agrees', () => {
    expect(zoneOf('SELF', 'KH')).toBe('Cambodia'); // coded CD, which is Congo
    expect(zoneOf('SELF', 'CD')).toBeUndefined();
    expect(zoneOf('SELF', 'KE')).toMatch(/^Kenya/);
    expect(zoneOf('EXPRESS', 'ST')).toBeUndefined(); // "Scotland" coded ST (São Tomé)
    expect(zoneOf('EXPRESS', 'IE')).toBeUndefined(); // "Northern Ireland"
    expect(zoneOf('ECONOMY', 'GB')).toBe('UK ECONOMY');
  });

  it('lists what it could not link instead of guessing', () => {
    expect(plan.unmatched.some((u) => /Scotland/i.test(u))).toBe(true);
  });
});

describe('a provider picked by the admin', () => {
  const pick = (code: string, allIn: boolean) =>
    pickTables(tables, { code, name: code }, allIn);

  it("reads the carrier's own grid, renamed to the chosen provider", () => {
    const { tables: picked, warnings } = pick('DHL_EXPRESS', false);
    expect(picked.map((t) => t.sheet)).toEqual(['DHL', 'DHL']);
    expect(picked[0].providers[0].code).toBe('DHL_EXPRESS');
    expect(warnings).toEqual([]);
  });

  it('lets the toggle choose between the normal and the all-in sheet', () => {
    expect(new Set(pick('SELF', false).tables.map((t) => t.sheet))).toEqual(new Set(['Plus GST']));
    expect(new Set(pick('SELF', true).tables.map((t) => t.sheet))).toEqual(new Set(['AllIn']));
  });

  it('says so when it has to guess which table is the provider', () => {
    expect(pick('ARAMEX', false).warnings[0]).toMatch(/doesn't name ARAMEX/);
  });

  it('compares the sheet with the live rates cell by cell', () => {
    const plan = buildPlan(pick('UPS', false).tables, new CountryMatcher(COUNTRIES));
    const zone1 = plan.providers.get('UPS')!.zones.get('zone 1')!.cards.get('PACKAGE')!;
    const first = zone1[0];
    const view = sheetView(
      { id: 'p', code: 'UPS', name: 'UPS' },
      [
        {
          shipmentType: 'PACKAGE',
          taxInclusive: false,
          zone: { name: 'Zone 1' },
          weightSlabs: [
            { weightFromKg: first.weightFromKg, weightToKg: first.weightToKg, baseRate: first.rate - 1, rateType: first.rateType },
            { weightFromKg: 900, weightToKg: 950, baseRate: 5, rateType: 'FLAT' },
          ],
        },
        {
          shipmentType: 'PACKAGE',
          taxInclusive: false,
          zone: { name: 'Old zone' },
          weightSlabs: [{ weightFromKg: 0, weightToKg: 0.5, baseRate: 700, rateType: 'FLAT' }],
        },
      ],
      { plan, allIn: false },
      [],
      [],
    );
    const grid = view.grids.find((g) => g.shipmentType === 'PACKAGE')!;
    const col = grid.columns.indexOf('Zone 1');
    const row = grid.rows.find((r) => r.fromKg === first.weightFromKg && r.toKg === first.weightToKg)!;
    expect(row.cells[col]).toEqual({ old: first.rate - 1, new: first.rate, perKg: false, changed: true });
    // A band the new sheet no longer has goes; a zone it never mentions is kept as it is.
    expect(grid.rows.find((r) => r.fromKg === 900)!.cells[col]).toMatchObject({ old: 5, new: null });
    const kept = grid.columns.indexOf('Old zone');
    expect(grid.rows[0].cells[kept]).toMatchObject({ old: 700, new: 700, changed: false });
    expect(view.summary).toMatchObject({ changed: 1, removed: 1, unchanged: 1 });
  });
});
