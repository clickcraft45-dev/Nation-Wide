import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { buildWorkbook, type Cell } from '../../common/xlsx/xlsx-writer';
import { readSheetFromBuffer } from '../../common/xlsx/xlsx-reader';

/**
 * Countries in and out as .xlsx. (Rates go in and out per provider, as the carrier's own sheet:
 * see RateSheetImportService.)
 *
 * Export and template share their column list with the importer, so a sheet exported, edited and
 * imported back round-trips. Import is an upsert keyed on the country code, never on database ids,
 * so a row typed into the template by hand behaves exactly like an exported one.
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
        const text = value(column).replace(/[, ₹%]/g, '');
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
