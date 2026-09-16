import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { buildWorkbook, type Cell } from '../../common/xlsx/xlsx-writer';
import { readSheetFromBuffer } from '../../common/xlsx/xlsx-reader';

/**
 * Countries and rate cards, in and out as .xlsx — the format the pricing team already works in.
 *
 * Export and template share their column list with the importer, so a sheet exported, edited and
 * imported back round-trips. Import is an upsert keyed on the natural key of each row (country
 * code; provider + zone + shipment type + weight band), never on database ids, so a row typed into
 * the template by hand behaves exactly like an exported one.
 */
@Injectable()
export class PricingSpreadsheetService {
  private readonly logger = new Logger(PricingSpreadsheetService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- countries

  private static readonly COUNTRY_COLUMNS = [
    'Country Code',
    'Country Name',
    'Active',
  ] as const;

  async exportCountries(): Promise<Buffer> {
    const countries = await this.prisma.country.findMany({
      orderBy: { name: 'asc' },
    });
    return buildWorkbook([
      {
        name: 'Countries',
        rows: [
          [...PricingSpreadsheetService.COUNTRY_COLUMNS],
          ...countries.map((c): Cell[] => [
            c.code,
            c.name,
            c.isActive ? 'Yes' : 'No',
          ]),
        ],
      },
    ]);
  }

  countriesTemplate(): Buffer {
    return buildWorkbook([
      {
        name: 'Countries',
        rows: [
          [...PricingSpreadsheetService.COUNTRY_COLUMNS],
          ['AE', 'United Arab Emirates', 'Yes'],
          ['GB', 'United Kingdom', 'Yes'],
          ['SG', 'Singapore', 'No'],
        ],
      },
      { name: 'How to use', rows: HOW_TO_USE_COUNTRIES },
    ]);
  }

  /**
   * What importing this file would do, without doing it: one row per line of the sheet with the
   * fields that would change. `commit` writes the very same decisions — preview and import run the
   * identical code path, so the preview can never describe an import the importer would not do.
   */
  async previewCountries(file: Buffer): Promise<ImportPlan> {
    return this.runCountries(file, false);
  }

  async importCountries(file: Buffer): Promise<ImportPlan> {
    return this.runCountries(file, true);
  }

  private async runCountries(
    file: Buffer,
    commit: boolean,
  ): Promise<ImportPlan> {
    const rows = this.rowsOf(file, [
      ...PricingSpreadsheetService.COUNTRY_COLUMNS,
    ]);
    const plan = emptyPlan(commit);

    for (const { line, value } of rows) {
      const code = value('Country Code').toUpperCase();
      const name = value('Country Name');
      if (!code && !name) {
        plan.skipped += 1;
        continue;
      }
      if (!/^[A-Z]{2}$/.test(code)) {
        this.reject(
          plan,
          line,
          code || '(blank)',
          'Not a 2-letter country code.',
        );
        continue;
      }
      if (!name) {
        this.reject(plan, line, code, 'Country name is empty.');
        continue;
      }

      const isActive = this.yesNo(value('Active'), true);
      const existing = await this.prisma.country.findUnique({
        where: { code },
      });
      const label = `${code} — ${name}`;

      if (!existing) {
        plan.created += 1;
        this.record(plan, {
          line,
          label,
          action: 'create',
          changes: [
            { field: 'Name', from: null, to: name },
            { field: 'Active', from: null, to: isActive ? 'Yes' : 'No' },
          ],
        });
        if (commit)
          await this.prisma.country.create({ data: { code, name, isActive } });
        continue;
      }

      const changes = diff([
        ['Name', existing.name, name],
        ['Active', existing.isActive ? 'Yes' : 'No', isActive ? 'Yes' : 'No'],
      ]);
      if (changes.length === 0) {
        plan.unchanged += 1;
        continue;
      }
      plan.updated += 1;
      this.record(plan, { line, label, action: 'update', changes });
      if (commit) {
        await this.prisma.country.update({
          where: { code },
          data: { name, isActive },
        });
      }
    }
    return plan;
  }

  // --------------------------------------------------------------- rate cards

  private static readonly RATE_COLUMNS = [
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
  ] as const;

  async exportRateCards(): Promise<Buffer> {
    const slabs = await this.prisma.weightSlab.findMany({
      include: {
        rateCard: { include: { zone: { include: { rateProvider: true } } } },
      },
      orderBy: [{ rateCard: { zoneId: 'asc' } }, { weightFromKg: 'asc' }],
    });
    const rows = slabs.map((slab): Cell[] => [
      slab.rateCard.zone.rateProvider.code,
      slab.rateCard.zone.rateProvider.name,
      slab.rateCard.zone.name,
      slab.rateCard.shipmentType,
      slab.rateCard.currency,
      slab.weightFromKg,
      slab.weightToKg,
      slab.baseRate,
      slab.rateType,
      slab.gstPercent,
      slab.nationwideCut,
      slab.isActive ? 'Yes' : 'No',
    ]);

    // A second sheet so an export doubles as the zone/country map, which is what someone editing
    // rates asks for next.
    const zoneCountries = await this.prisma.zoneCountry.findMany({
      include: { zone: true, country: true, rateProvider: true },
      orderBy: [{ zone: { name: 'asc' } }, { country: { name: 'asc' } }],
    });

    return buildWorkbook([
      {
        name: 'Rate Cards',
        rows: [[...PricingSpreadsheetService.RATE_COLUMNS], ...rows],
      },
      {
        name: 'Zone Countries',
        rows: [
          ['Provider Code', 'Zone', 'Country Code', 'Country Name'],
          ...zoneCountries.map((zc): Cell[] => [
            zc.rateProvider.code,
            zc.zone.name,
            zc.country.code,
            zc.country.name,
          ]),
        ],
      },
    ]);
  }

  rateCardsTemplate(): Buffer {
    return buildWorkbook([
      {
        name: 'Rate Cards',
        rows: [
          [...PricingSpreadsheetService.RATE_COLUMNS],
          [
            'FEDEX',
            'FedEx',
            'Zone 1',
            'PARCEL',
            'INR',
            0.5,
            1,
            1850,
            'FLAT',
            18,
            150,
            'Yes',
          ],
          [
            'FEDEX',
            'FedEx',
            'Zone 1',
            'PARCEL',
            'INR',
            1,
            2,
            2400,
            'FLAT',
            18,
            150,
            'Yes',
          ],
          [
            'FEDEX',
            'FedEx',
            'Zone 1',
            'PARCEL',
            'INR',
            2,
            5,
            780,
            'PER_KG',
            18,
            150,
            'Yes',
          ],
          [
            'DHL',
            'DHL',
            'Zone 3',
            'DOCUMENT',
            'INR',
            0,
            0.5,
            1650,
            'FLAT',
            18,
            100,
            'Yes',
          ],
        ],
      },
      { name: 'How to use', rows: HOW_TO_USE_RATES },
    ]);
  }

  /**
   * What importing this rate sheet would do. Every band in the file updates the band with the same
   * weight range on that rate card; bands only in the database are left alone, so a partial sheet
   * is a partial update rather than a silent delete of everything missing from it.
   *
   * Preview creates nothing — not even the provider or zone a new row refers to. Those show up in
   * the plan as "will be created" instead.
   */
  async previewRateCards(file: Buffer, actorId: string): Promise<ImportPlan> {
    return this.runRateCards(file, actorId, false);
  }

  async importRateCards(file: Buffer, actorId: string): Promise<ImportPlan> {
    return this.runRateCards(file, actorId, true);
  }

  private async runRateCards(
    file: Buffer,
    actorId: string,
    commit: boolean,
  ): Promise<ImportPlan> {
    const rows = this.rowsOf(
      file,
      [...PricingSpreadsheetService.RATE_COLUMNS],
      'Rate Cards',
    );
    const plan = emptyPlan(commit);

    for (const { line, value, number } of rows) {
      const providerCode = value('Provider Code').toUpperCase();
      const zoneName = value('Zone');
      const shipmentType = value('Shipment Type').toUpperCase();
      if (!providerCode && !zoneName) {
        plan.skipped += 1;
        continue;
      }
      const weightFromKg = number('Weight From (kg)');
      const weightToKg = number('Weight To (kg)');
      const baseRate = number('Base Rate');
      const label = `${providerCode || '?'} · ${zoneName || '?'} · ${shipmentType || '?'} · ${weightFromKg ?? '?'}–${weightToKg ?? '?'}kg`;

      if (!providerCode || !zoneName) {
        this.reject(
          plan,
          line,
          label,
          'Provider code and zone are both required.',
        );
        continue;
      }
      if (!['DOCUMENT', 'PARCEL', 'PACKAGE'].includes(shipmentType)) {
        this.reject(
          plan,
          line,
          label,
          'Shipment type must be DOCUMENT, PARCEL or PACKAGE.',
        );
        continue;
      }
      if (weightFromKg === null || weightToKg === null || baseRate === null) {
        this.reject(
          plan,
          line,
          label,
          'Weight from/to and base rate must be numbers.',
        );
        continue;
      }
      if (weightToKg <= weightFromKg) {
        this.reject(
          plan,
          line,
          label,
          `Weight to (${weightToKg}) must be above weight from (${weightFromKg}).`,
        );
        continue;
      }
      const rateType = value('Rate Type').toUpperCase() || 'FLAT';
      if (!['FLAT', 'PER_KG'].includes(rateType)) {
        this.reject(plan, line, label, 'Rate type must be FLAT or PER_KG.');
        continue;
      }

      const currency = value('Currency') || 'INR';
      const gstPercent = number('GST %') ?? 0;
      const nationwideCut = number('NationWide Cut') ?? 0;
      const isActive = this.yesNo(value('Active'), true);

      // Read-only lookups first: the plan has to be able to describe a new provider/zone/card
      // without creating one.
      const provider = await this.prisma.rateProvider.findUnique({
        where: { code: providerCode },
      });
      const zone = provider
        ? await this.prisma.zone.findUnique({
            where: {
              rateProviderId_name: {
                rateProviderId: provider.id,
                name: zoneName,
              },
            },
          })
        : null;
      const rateCard = zone
        ? await this.prisma.rateCard.findUnique({
            where: { zoneId_shipmentType: { zoneId: zone.id, shipmentType } },
          })
        : null;
      const existing = rateCard
        ? await this.prisma.weightSlab.findFirst({
            where: { rateCardId: rateCard.id, weightFromKg, weightToKg },
          })
        : null;

      const newRows: ImportRowChange[] = [];
      if (!provider)
        newRows.push({
          field: 'Provider',
          from: null,
          to: `${providerCode} (new)`,
        });
      if (!zone)
        newRows.push({ field: 'Zone', from: null, to: `${zoneName} (new)` });
      if (!rateCard)
        newRows.push({
          field: 'Rate card',
          from: null,
          to: `${shipmentType} ${currency} (new)`,
        });

      const changes = existing
        ? diff([
            ['Base rate', existing.baseRate, baseRate],
            ['Rate type', existing.rateType, rateType],
            ['GST %', existing.gstPercent, gstPercent],
            ['NationWide cut', existing.nationwideCut, nationwideCut],
            [
              'Active',
              existing.isActive ? 'Yes' : 'No',
              isActive ? 'Yes' : 'No',
            ],
          ])
        : [
            ...newRows,
            { field: 'Base rate', from: null, to: String(baseRate) },
            { field: 'Rate type', from: null, to: rateType },
            { field: 'GST %', from: null, to: String(gstPercent) },
            { field: 'NationWide cut', from: null, to: String(nationwideCut) },
            { field: 'Active', from: null, to: isActive ? 'Yes' : 'No' },
          ];

      if (existing && changes.length === 0) {
        plan.unchanged += 1;
        continue;
      }
      if (existing) {
        plan.updated += 1;
        this.record(plan, { line, label, action: 'update', changes });
      } else {
        plan.created += 1;
        this.record(plan, { line, label, action: 'create', changes });
      }

      if (!commit) continue;

      const savedProvider =
        provider ??
        (await this.prisma.rateProvider.create({
          data: {
            code: providerCode,
            name: value('Provider Name') || providerCode,
          },
        }));
      const savedZone =
        zone ??
        (await this.prisma.zone.create({
          data: { rateProviderId: savedProvider.id, name: zoneName },
        }));
      const savedCard =
        rateCard ??
        (await this.prisma.rateCard.create({
          data: {
            zoneId: savedZone.id,
            shipmentType,
            currency,
            createdByAdminId: actorId,
          },
        }));
      const data = {
        baseRate,
        rateType: rateType as 'FLAT' | 'PER_KG',
        gstPercent,
        nationwideCut,
        isActive,
        updatedByAdminId: actorId,
      };
      if (existing) {
        await this.prisma.weightSlab.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.weightSlab.create({
          data: {
            ...data,
            rateCardId: savedCard.id,
            weightFromKg,
            weightToKg,
            createdByAdminId: actorId,
          },
        });
      }
    }

    if (commit) {
      this.logger.log(
        `Rate card import by ${actorId}: ${plan.created} created, ${plan.updated} updated, ${plan.errors.length} rejected`,
      );
    }
    return plan;
  }

  // ------------------------------------------------------------------ helpers

  /** Header-keyed rows, so a reordered or extra column in the uploaded sheet is harmless. */
  private rowsOf(file: Buffer, required: string[], sheetName?: string) {
    let raw: string[][];
    try {
      raw = readSheetFromBuffer(file, sheetName);
    } catch {
      // A wrong sheet name is the common case: fall back to the first sheet.
      try {
        raw = readSheetFromBuffer(file);
      } catch (error) {
        throw new BadRequestException(
          `That file could not be read as a spreadsheet (${(error as Error).message}). Export the template and edit that.`,
        );
      }
    }
    if (raw.length === 0) throw new BadRequestException('That sheet is empty.');

    const header = raw[0].map((h) => h.trim());
    const index = new Map(header.map((h, i) => [h.toLowerCase(), i]));
    const missing = required.filter((c) => !index.has(c.toLowerCase()));
    if (missing.length > 0) {
      throw new BadRequestException(
        `These columns are missing: ${missing.join(', ')}. Download the template to see the expected columns.`,
      );
    }

    return raw.slice(1).map((cells, i) => {
      const value = (column: string) =>
        (cells[index.get(column.toLowerCase())!] ?? '').trim();
      const number = (column: string) => {
        const text = value(column).replace(/[, ₹]/g, '');
        const n = Number(text);
        return text && Number.isFinite(n) ? n : null;
      };
      return { line: i + 2, value, number };
    });
  }

  /** A rejected row: counted, listed in the plan, and never written. */
  private reject(
    plan: ImportPlan,
    line: number,
    label: string,
    message: string,
  ) {
    plan.errors.push(`Row ${line}: ${message}`);
    this.record(plan, { line, label, action: 'error', message, changes: [] });
  }

  private record(plan: ImportPlan, row: ImportRow) {
    // The preview table stays readable (and the response small) on a 5,000-row rate book; the
    // counts above it are always the full picture.
    if (plan.rows.length < MAX_PREVIEW_ROWS) plan.rows.push(row);
    else plan.rowsTruncated = true;
  }

  private yesNo(value: string, fallback: boolean): boolean {
    const text = value.trim().toLowerCase();
    if (!text) return fallback;
    return ['yes', 'y', 'true', '1', 'active'].includes(text);
  }
}

const MAX_PREVIEW_ROWS = 300;

export interface ImportRowChange {
  field: string;
  /** null when the row is new. */
  from: string | null;
  to: string;
}

export interface ImportRow {
  /** The row number in the sheet, so a rejected row can be found and fixed. */
  line: number;
  label: string;
  action: 'create' | 'update' | 'error';
  message?: string;
  changes: ImportRowChange[];
}

/**
 * What an import would do (preview) or did do (`committed: true`). The counts cover every row; the
 * `rows` list is capped for display.
 */
export interface ImportPlan {
  committed: boolean;
  created: number;
  updated: number;
  /** Rows already matching the database — nothing to do. */
  unchanged: number;
  /** Blank rows, which a spreadsheet always has a few of below the data. */
  skipped: number;
  /** One line per rejected row; every other row is still imported. */
  errors: string[];
  rows: ImportRow[];
  rowsTruncated: boolean;
}

function emptyPlan(committed: boolean): ImportPlan {
  return {
    committed,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    rows: [],
    rowsTruncated: false,
  };
}

/** Only the fields that actually differ, as display strings. */
function diff(
  fields: [string, string | number | null, string | number][],
): ImportRowChange[] {
  return fields
    .filter(([, from, to]) => String(from ?? '') !== String(to))
    .map(([field, from, to]) => ({
      field,
      from: from === null ? null : String(from),
      to: String(to),
    }));
}

const HOW_TO_USE_COUNTRIES: Cell[][] = [
  ['How to use this sheet'],
  [''],
  ['1. Fill one row per country on the "Countries" sheet.'],
  [
    '2. Country Code is the 2-letter ISO code (IN, AE, GB). It is what a country is matched on.',
  ],
  ['3. A code already in the system is updated; a new code is added.'],
  [
    '4. Active: Yes or No. No hides the country from customers without deleting its rates.',
  ],
  ['5. Save as .xlsx and upload it on Admin → Countries → Import.'],
  [''],
  [
    'Nothing is ever deleted by an import — remove a country in the admin screen instead.',
  ],
];

const HOW_TO_USE_RATES: Cell[][] = [
  ['How to use this sheet'],
  [''],
  ['1. One row per weight band on the "Rate Cards" sheet.'],
  [
    '2. Provider Code + Zone + Shipment Type identify the rate card; missing ones are created.',
  ],
  [
    '3. Weight From/To are in kg. From is inclusive, To is exclusive (0.5–1 then 1–2).',
  ],
  [
    '4. Rate Type: FLAT charges Base Rate for the band; PER_KG multiplies it by the weight.',
  ],
  ['5. GST % and NationWide Cut are numbers, not text ("18", not "18%").'],
  ['6. Shipment Type: DOCUMENT, PARCEL or PACKAGE.'],
  ['7. Active: Yes or No.'],
  [''],
  [
    'A band whose weight range already exists is updated in place; a new range is added.',
  ],
  [
    'Bands missing from the file are left untouched, so you can upload one zone at a time.',
  ],
];
