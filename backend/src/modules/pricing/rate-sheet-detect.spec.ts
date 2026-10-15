import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listSheets, readSheetFromBuffer } from '../../common/xlsx/xlsx-reader';
import {
  buildBands,
  detectRateTables,
  parseWeightLabel,
  type DetectedTable,
} from './rate-sheet-detect';

// The consolidator's real rate book, kept in docs/ — the layouts this importer exists for.
const WORKBOOK = join(
  __dirname,
  '../../../../docs/15th_July_2026_Mumbai_GST_atlantic_international_SELF_rates_DHL_FEDEX.xlsx',
);

function allTables(): DetectedTable[] {
  const buf = readFileSync(WORKBOOK);
  return listSheets(buf).flatMap((sheet) =>
    detectRateTables(sheet, readSheetFromBuffer(buf, sheet)),
  );
}

const zoneOf = (
  table: DetectedTable | undefined,
  name: string,
  type = 'PACKAGE',
) =>
  table?.providers
    .flatMap((p) => p.zones)
    .find((z) => z.name === name && z.shipmentType === type);

describe('buildBands', () => {
  it('expands first 500 g + each extra 500 g into flat bands, then per-kg brackets', () => {
    const bands = buildBands([
      { label: { kind: 'first' }, price: 1700 },
      { label: { kind: 'add' }, price: 500 },
      { label: { kind: 'from', kg: 6 }, price: 730 },
      { label: { kind: 'from', kg: 8 }, price: null }, // "Receiver nationality only" ends the 6+ bracket
      { label: { kind: 'from', kg: 11 }, price: 590 },
    ]);
    expect(bands.slice(0, 2)).toEqual([
      { weightFromKg: 0, weightToKg: 0.5, rate: 1700, rateType: 'FLAT' },
      { weightFromKg: 0.51, weightToKg: 1, rate: 2200, rateType: 'FLAT' },
    ]);
    expect(bands[10]).toEqual({
      weightFromKg: 5.01,
      weightToKg: 5.5,
      rate: 6700,
      rateType: 'FLAT',
    });
    expect(bands[11]).toEqual({
      weightFromKg: 5.51,
      weightToKg: 7.99,
      rate: 730,
      rateType: 'PER_KG',
    });
    // 8–10.99 had no price: a gap, so no quote there rather than the 6+ rate running on.
    expect(bands[12]).toEqual({
      weightFromKg: 11,
      weightToKg: 1000,
      rate: 590,
      rateType: 'PER_KG',
    });
  });

  it('reads weight headings the way each layout means them', () => {
    expect(parseWeightLabel('1.5', 'grid')).toEqual({ kind: 'at', kg: 1.5 });
    expect(parseWeightLabel('6', 'list')).toEqual({ kind: 'from', kg: 6 });
    expect(parseWeightLabel('21-44 kgs', 'grid')).toEqual({
      kind: 'from',
      kg: 21,
      toKg: 44,
    });
    expect(parseWeightLabel('500  gms', 'list')).toEqual({ kind: 'first' });
    expect(parseWeightLabel('Addl 500 gms', 'grid')).toEqual({ kind: 'add' });
    expect(parseWeightLabel('Service Suspended', 'list')).toBeNull();
  });
});

describe('detectRateTables on the real rate book', () => {
  const tables = allTables();
  const byId = (id: string) => tables.find((t) => t.id === id);

  it('splits a carrier grid into document and package cards at its section labels', () => {
    const ups = byId('UPS Express Saver Basic!4');
    expect(ups?.providers[0].code).toBe('UPS');
    expect(zoneOf(ups, 'Zone 1', 'DOCUMENT')?.bands[0].rate).toBe(979);
    expect(zoneOf(ups, 'Zone 1')?.bands[0].rate).toBe(1048);
    // A column named for a country is that country's own rate.
    expect(zoneOf(ups, 'AU')?.countryCodes).toEqual(['AU']);
  });

  it('reads a From | To per-kg table with its zones shifted over', () => {
    const dhl = byId('DHL!62');
    expect(dhl?.providers[0].zones).toHaveLength(14);
    expect(zoneOf(dhl, 'Zone 1')?.bands[0]).toEqual({
      weightFromKg: 30.1,
      weightToKg: 50,
      rate: 538,
      rateType: 'PER_KG',
    });
  });

  it("reads the carrier's own country → zone list", () => {
    expect(byId('DHL!4')?.countryMap).toContainEqual({
      country: 'Afghanistan',
      code: 'AF',
      zone: 'Zone 11',
    });
    expect(byId('Fedex IP!4')?.countryMap).toContainEqual({
      country: 'Aruba',
      code: null,
      zone: 'J',
    });
  });

  it('makes one provider per service in a country list, starting where prices start', () => {
    const africa = byId('Plus GST!26');
    expect(africa?.providers.map((p) => p.code)).toEqual(['SELF']);
    const kenya = africa?.providers[0].zones.find((z) =>
      z.countryCodes.includes('KE'),
    );
    expect(kenya?.bands[0]).toEqual({
      weightFromKg: 6,
      weightToKg: 7.99,
      rate: 275,
      rateType: 'PER_KG',
    });
    // A consolidator's "FEDEX" service is kept apart from the FedEx carrier grid.
    expect(byId('Plus GST!73')?.providers.map((p) => p.code)).toContain(
      'FEDEX_PLUS_GST',
    );
  });

  it('leaves the GST-inclusive copy and import rates unticked', () => {
    expect(
      tables.filter((t) => t.sheet === 'AllIn').every((t) => !t.suggested),
    ).toBe(true);
    expect(byId('Plus GST!240')?.suggested).toBe(false);
    expect(byId('Plus GST!26')?.suggested).toBe(true);
  });
});
