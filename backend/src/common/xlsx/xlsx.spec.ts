import { buildWorkbook } from './xlsx-writer';
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
});
