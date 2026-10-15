import { buildWorkbook, type Cell } from '../../common/xlsx/xlsx-writer';
import { PricingSpreadsheetService } from './pricing-spreadsheet.service';
import type { PrismaService } from '../../database/prisma.service';

const HEADER = [
  'Provider Code',
  'Provider Name',
  'Zone',
  'Shipment Type',
  'Currency',
  'Weight From (kg)',
  'Weight To (kg)',
  'Base Rate',
  'Rate Type',
  'GST %',
  'NationWide Cut',
  'Active',
];

// An empty database: every row is a new provider, zone, card and band.
const prisma = {
  rateProvider: { findUnique: jest.fn().mockResolvedValue(null) },
  zone: { findUnique: jest.fn().mockResolvedValue(null) },
  rateCard: { findUnique: jest.fn().mockResolvedValue(null) },
  weightSlab: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
} as unknown as PrismaService;

const preview = (rows: Cell[][]) =>
  new PricingSpreadsheetService(prisma).previewRateCards(
    buildWorkbook([{ name: 'Rate Cards', rows: [HEADER, ...rows] }]),
    'admin',
  );

const row = (type: string, from: number, to: number, gst: Cell = 18): Cell[] =>
  ['FEDEX', 'FedEx', 'Zone 1', type, 'INR', from, to, 1000, 'FLAT', gst, 0, 'Yes'];

describe('PricingSpreadsheetService rate card import', () => {
  it('saves PARCEL on the PACKAGE card, the one parcels are priced from', async () => {
    const plan = await preview([row('PARCEL', 0, 0.5)]);
    expect(plan.rows[0].label).toContain('PACKAGE');
    expect(plan.errors).toEqual([]);
  });

  it('reads "18%" as 18 and refuses a percent-formatted 0.18 or a word', async () => {
    const plan = await preview([
      row('PACKAGE', 0, 0.5, '18%'),
      row('PACKAGE', 0.51, 1, 0.18),
      row('PACKAGE', 1.01, 1.5, 'eighteen'),
    ]);
    expect(plan.created).toBe(1);
    expect(plan.rows[0].changes).toContainEqual({ field: 'GST %', from: null, to: '18' });
    expect(plan.errors).toHaveLength(2);
  });

  it('refuses bands that share an edge, which would price one weight twice', async () => {
    const plan = await preview([row('PACKAGE', 0.5, 1), row('PACKAGE', 1, 2)]);
    expect(plan.created).toBe(1);
    expect(plan.errors[0]).toMatch(/Row 3: .*overlaps/);
  });

  it('ships a template that imports cleanly', async () => {
    const service = new PricingSpreadsheetService(prisma);
    const plan = await service.previewRateCards(service.rateCardsTemplate(), 'admin');
    expect(plan.errors).toEqual([]);
    expect(plan.created).toBe(4);
  });
});
