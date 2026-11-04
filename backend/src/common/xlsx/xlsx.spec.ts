import { buildWorkbook, zip } from './xlsx-writer';
import { detectRateTables } from '../../modules/pricing/rate-sheet-detect';
import { listSheets, readSheetFromBuffer } from './xlsx-reader';

// The writer and the reader are two halves of the same contract: an exported sheet has to come
// back through the importer unchanged. A round trip is the cheapest way to hold both to it.
describe('xlsx round trip', () => {
  it('reads back the sheets, values and types it wrote', () => {
    const file = buildWorkbook([
      {
        name: 'Rate Cards',
        rows: [
          ['Provider Code', 'Zone', 'Base Rate'],
          ['FEDEX', 'Zone 1', 1850],
          ['DHL', 'Zone 3', 1650.5],
        ],
      },
      { name: 'How to use', rows: [['One row per weight band.']] },
    ]);

    expect(listSheets(file)).toEqual(['Rate Cards', 'How to use']);
    expect(readSheetFromBuffer(file, 'Rate Cards')).toEqual([
      ['Provider Code', 'Zone', 'Base Rate'],
      ['FEDEX', 'Zone 1', '1850'],
      ['DHL', 'Zone 3', '1650.5'],
    ]);
    // No sheet name given: the first sheet, which is what an uploaded file usually relies on.
    expect(readSheetFromBuffer(file)[0]).toEqual([
      'Provider Code',
      'Zone',
      'Base Rate',
    ]);
  });

  it('survives the characters spreadsheets actually contain', () => {
    const file = buildWorkbook([
      {
        name: 'Countries',
        rows: [
          ['Country Name', 'Note'],
          ['Côte d’Ivoire', 'Fuel & GST <extra>'],
          ['Quote "test"', 'tab\tandbell'],
        ],
      },
    ]);
    const rows = readSheetFromBuffer(file);
    expect(rows[1]).toEqual(['Côte d’Ivoire', 'Fuel & GST <extra>']);
    // The bell character is stripped (XML cannot carry it); the rest of the text stays.
    expect(rows[2][0]).toBe('Quote "test"');
    expect(rows[2][1]).toBe('tab\tandbell');
  });

  it('names a blank sheet rather than writing an unopenable file', () => {
    const file = buildWorkbook([{ name: '  ', rows: [['x']] }]);
    expect(listSheets(file)).toEqual(['Sheet1']);
  });

  // What ChatGPT hands back is written by openpyxl, not Excel: Target before Id in the
  // relationships, an absolute sheet path, shared strings, and no element at all for a blank
  // row. Uploading one used to fail with 'Could not resolve the file for sheet "FEDEX"'.
  it('reads a workbook written by openpyxl', () => {
    const strings = [
      'Fedex Package rates',
      'Weight (kg)',
      'Zone 1',
      'Zone 2',
      'Country',
      'Zone',
      'United States (US)',
      '1',
    ];
    const s = (v: string) =>
      `<c r="REF" t="s"><v>${strings.indexOf(v)}</v></c>`;
    const row = (r: number, cells: string[]) =>
      `<row r="${r}">${cells.map((c, i) => c.replace('REF', `${'ABC'[i]}${r}`)).join('')}</row>`;
    const n = (v: number) => `<c r="REF" t="n"><v>${v}</v></c>`;
    const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${[
      row(1, [s('Fedex Package rates')]),
      row(2, [s('Weight (kg)'), s('Zone 1'), s('Zone 2')]),
      row(3, [n(0.5), n(1200), n(1500)]),
      row(4, [n(1), n(1700), n(2100)]),
      // Row 5 left blank: openpyxl writes nothing for it.
      row(6, [s('Country'), s('Zone')]),
      row(7, [s('United States (US)'), s('1')]),
    ].join('')}</sheetData></worksheet>`;
    const file = zip(
      Object.entries({
        'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="FEDEX" sheetId="1" state="visible" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1"/></Relationships>`,
        'xl/sharedStrings.xml': `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`,
        'xl/worksheets/sheet1.xml': sheet,
      }).map(([name, xml]) => ({ name, data: Buffer.from(xml, 'utf8') })),
    );

    const rows = readSheetFromBuffer(file, 'FEDEX');
    expect(rows[2]).toEqual(['0.5', '1200', '1500']);
    expect(rows[4]).toEqual([]);
    expect(rows[6]).toEqual(['United States (US)', '1']);

    const [table] = detectRateTables('FEDEX', rows);
    expect(table.providers[0].zones.map((z) => z.name)).toEqual([
      'Zone 1',
      'Zone 2',
    ]);
    expect(table.countryMap).toEqual([
      { country: 'United States', code: 'US', zone: 'Zone 1' },
    ]);
  });
});
