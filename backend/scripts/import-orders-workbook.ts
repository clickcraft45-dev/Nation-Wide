/**
 * Seeds the real shipment book from the operations spreadsheet: one Order + Shipment +
 * ExternalTrackingNumber per row, plus the customers (consignors), pickup partners (the pickup
 * person) and shipping providers (the vendor) those rows refer to.
 *
 *   npm run db:import:orders --workspace=backend -- "../docs/Untitled spreadsheet.xlsx"
 *   npm run db:import:orders --workspace=backend -- "<file>" --dry-run
 *
 * Idempotent: a row whose external tracking number already exists is skipped, so a re-run after a
 * partial failure imports only what is missing. --dry-run touches nothing and prints the summary,
 * which is the way to check a new spreadsheet before it reaches the database.
 *
 * Unlike scripts/import-nwseed-orders.ts (a one-off JSON recovery that skipped rows whose customer
 * did not already exist), this reads the workbook directly and creates what is missing.
 */
import { randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient, type Prisma } from '@prisma/client';
import { readSheet } from './xlsx-reader';
import { formatInternalTrackingNumber } from '../src/modules/shipments/tracking-number';
import { nextSequenceNumber } from '../src/modules/shipments/sequence';

const prisma = new PrismaClient();

const DEFAULT_FILE = '../docs/Untitled spreadsheet.xlsx';
// Both sheets carry the same columns; the second has no header row.
const SHEETS = ['ICL FEDEX AND UPS', 'Atlantic, UNITED, WORLD FIRST'];

const COLUMN = {
  date: 0,
  awb: 1,
  trkNumber: 2,
  vendor: 3,
  service: 4,
  pickupPerson: 5,
  consignor: 6,
  consignorMobile: 7,
  consignorAddress: 8,
  consignee: 9,
  consigneeMobile: 10,
  consigneeAddress: 11,
  pieces: 12,
  weight: 13,
  content: 14,
} as const;

// The vendor column is a short code; these are the names shown anywhere the provider appears.
const VENDOR_NAMES: Record<string, string> = {
  ICL: 'ICL',
  WF: 'World First',
  UNITED: 'United',
  ATL: 'Atlantic',
  ATLANTIC: 'Atlantic',
};

/** "N/A", "-", "" and friends all mean "not filled in". */
function clean(value: string | undefined): string {
  const text = (value ?? '').trim();
  return !text || /^(n\/?a|-|na|nil)$/i.test(text) ? '' : text;
}

/**
 * Spreadsheet numbers arrive in scientific notation ("8.73811086712E11"), which would otherwise be
 * stored as a tracking number nobody can search for. Real text (AWB "BC1921646", "1ZGX059...") is
 * left alone — only plain and exponent-form numbers are expanded.
 */
function digits(value: string | undefined): string {
  const text = clean(value);
  if (!text || !/^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(text)) return text;
  const n = Number(text);
  return Number.isFinite(n) ? BigInt(Math.round(n)).toString() : text;
}

function toNumber(value: string | undefined): number | null {
  const text = clean(value);
  const n = Number(text);
  return text && Number.isFinite(n) ? n : null;
}

/**
 * The date column holds either an Excel serial (days since 1899-12-30) or typed text in
 * day/month/year — both are in this workbook, and treating the text ones as missing dated a fifth
 * of the book "today".
 */
function sheetDate(value: string | undefined): Date | null {
  const text = clean(value);
  if (!text) return null;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const serial = toNumber(text);
  if (serial === null || serial < 20_000 || serial > 60_000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
}

/**
 * Senders are Indian and their 10-digit mobiles have no country code, so those get +91. Recipient
 * numbers are foreign as often as not, so they are kept exactly as written — guessing +91 onto a
 * US number produces a number that looks dialable and is not.
 */
function indianPhone(value: string | undefined): string {
  const raw = digits(value).replace(/\D/g, '');
  if (!raw) return '';
  if (raw.length === 10) return `+91${raw}`;
  if (raw.length === 12 && raw.startsWith('91')) return `+${raw}`;
  return raw;
}

function rawPhone(value: string | undefined): string {
  return digits(value).replace(/\D/g, '');
}

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface Row {
  sheet: string;
  line: number;
  date: Date | null;
  awb: string;
  trkNumber: string;
  vendor: string;
  service: string;
  pickupPerson: string;
  consignor: string;
  consignorPhone: string;
  consignorAddress: string;
  consignee: string;
  consigneePhone: string;
  consigneeAddress: string;
  pieces: number | null;
  weightKg: number | null;
  content: string;
}

function parse(file: string): Row[] {
  const rows: Row[] = [];
  for (const sheet of SHEETS) {
    let raw: string[][];
    try {
      raw = readSheet(file, sheet);
    } catch (error) {
      console.warn(`! skipping sheet "${sheet}": ${(error as Error).message}`);
      continue;
    }
    raw.forEach((cells, i) => {
      // Header rows and blank spacer rows: a real row always has a tracking or AWB number.
      if (
        /^(awb|date)$/i.test(clean(cells[COLUMN.awb])) ||
        /^date$/i.test(clean(cells[COLUMN.date]))
      )
        return;
      // Some rows carry the vendor in the tracking column and no tracking number at all
      // ("15/07/2026 | 99215829 | UNITED | | SELF"), which shifts vendor/service one across.
      const trkCell = digits(cells[COLUMN.trkNumber]);
      const vendorInTrkColumn =
        /^[A-Z ]+$/i.test(trkCell) && trkCell.toUpperCase() in VENDOR_NAMES;
      const trkNumber = vendorInTrkColumn ? '' : trkCell;
      const awb = digits(cells[COLUMN.awb]);
      if (!trkNumber && !awb) return;
      rows.push({
        sheet,
        line: i + 1,
        date: sheetDate(cells[COLUMN.date]),
        awb,
        trkNumber,
        vendor: (vendorInTrkColumn
          ? trkCell
          : clean(cells[COLUMN.vendor])
        ).toUpperCase(),
        service: clean(cells[COLUMN.service]).toUpperCase(),
        pickupPerson: clean(cells[COLUMN.pickupPerson]),
        consignor: clean(cells[COLUMN.consignor]),
        consignorPhone: indianPhone(cells[COLUMN.consignorMobile]),
        consignorAddress: clean(cells[COLUMN.consignorAddress]),
        consignee: clean(cells[COLUMN.consignee]),
        consigneePhone: rawPhone(cells[COLUMN.consigneeMobile]),
        consigneeAddress: clean(cells[COLUMN.consigneeAddress]),
        pieces: toNumber(cells[COLUMN.pieces]),
        weightKg: toNumber(cells[COLUMN.weight]),
        content: clean(cells[COLUMN.content]),
      });
    });
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--')) ?? DEFAULT_FILE;

  const rows = parse(file);
  console.log(`Parsed ${rows.length} shipment rows from ${file}`);
  if (rows.length === 0) return;

  const vendors = [...new Set(rows.map((r) => r.vendor || 'ICL'))];
  const partners = [
    ...new Set(rows.map((r) => r.pickupPerson).filter(Boolean)),
  ];
  const consignors = [...new Set(rows.map((r) => r.consignor).filter(Boolean))];
  console.log(`  vendors: ${vendors.join(', ')}`);
  console.log(`  pickup partners: ${partners.length}`);
  console.log(`  consignors (customers): ${consignors.length}`);
  const undated = rows.filter((r) => !r.date).length;
  if (undated)
    console.log(
      `  ! ${undated} rows have no usable date — dated today instead`,
    );

  if (dryRun) {
    console.log(
      '\n--dry-run: nothing was written. Sample of the first 3 rows:',
    );
    rows.slice(0, 3).forEach((r) => console.log('   ', JSON.stringify(r)));
    return;
  }

  // ---- providers
  const providerByVendor = new Map<string, string>();
  for (const vendor of vendors) {
    const provider = await prisma.shippingProvider.upsert({
      where: { code: vendor },
      update: {},
      create: {
        code: vendor,
        name: VENDOR_NAMES[vendor] ?? vendor,
        // No integration for these — they are record-keeping providers until an adapter exists.
        adapterClass: 'ManualAdapter',
        isActive: true,
      },
    });
    providerByVendor.set(vendor, provider.id);
  }

  // ---- pickup partners (AdminUser rows). A random password nobody knows: these exist so the
  // historic pickups have a real partner attached; an admin sets a password to let one log in.
  const partnerByName = new Map<string, string>();
  for (const name of partners) {
    const email = `${slug(name)}@partners.nationwide.local`;
    const partner = await prisma.adminUser.upsert({
      where: { email },
      update: { name },
      create: {
        email,
        name,
        role: 'PICKUP_PARTNER',
        isActive: true,
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
      },
    });
    partnerByName.set(name, partner.id);
  }

  // ---- customers (consignors), matched on name first so an existing customer is reused
  const existing = await prisma.customer.findMany({
    select: { id: true, name: true, phone: true },
  });
  // Phone is unique, and two consignors in the book share a number often enough that a plain
  // create() dies on the second one. Matching on phone first reuses that customer instead.
  const customerByPhone = new Map(
    existing.filter((c) => c.phone).map((c) => [c.phone, c.id]),
  );
  const customerByName = new Map(
    existing.map((c) => [c.name.trim().toUpperCase(), c.id]),
  );
  for (const name of consignors) {
    const key = name.toUpperCase();
    if (customerByName.has(key)) continue;
    const row = rows.find((r) => r.consignor === name && r.consignorPhone);
    const sharedId = row?.consignorPhone
      ? customerByPhone.get(row.consignorPhone)
      : undefined;
    if (sharedId) {
      customerByName.set(key, sharedId);
      continue;
    }
    const created = await prisma.customer.create({
      data: {
        name,
        // Phone is unique and required; rows without one get a placeholder that is obviously not
        // dialable rather than a made-up number someone might call.
        phone: row?.consignorPhone ?? `NO-PHONE-${slug(name)}`,
        address:
          rows.find((r) => r.consignor === name && r.consignorAddress)
            ?.consignorAddress ?? null,
        consentGivenAt: new Date(),
        consentSource: 'spreadsheet_import',
      },
    });
    customerByName.set(key, created.id);
    if (created.phone) customerByPhone.set(created.phone, created.id);
  }

  // ---- orders + shipments + tracking numbers
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const vendor = row.vendor || 'ICL';
    const providerId = providerByVendor.get(vendor)!;
    const reference = row.trkNumber || row.awb;
    const already = await prisma.externalTrackingNumber.findFirst({
      where: { externalTrackingNumber: reference, providerId },
    });
    if (already) {
      skipped += 1;
      continue;
    }
    const customerId = customerByName.get(row.consignor.toUpperCase());
    if (!customerId) {
      console.warn(
        `! ${row.sheet} line ${row.line}: no consignor name, skipped`,
      );
      skipped += 1;
      continue;
    }
    const createdAt = row.date ?? new Date();

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId,
          status: 'CONFIRMED',
          createdAt,
          updatedAt: createdAt,
        },
      });
      // Placeholder then format, mirroring ShipmentsService.createForOrder: the real number is
      // derived from the sequence the database assigns.
      const shipment = await tx.shipment.create({
        data: {
          orderId: order.id,
          providerId,
          sequenceNumber: await nextSequenceNumber(tx),
          internalTrackingNumber: `PENDING-${randomUUID()}`,
          createdAt,
          updatedAt: createdAt,
        },
      });
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          internalTrackingNumber: formatInternalTrackingNumber(
            shipment.sequenceNumber,
            createdAt,
          ),
        },
      });
      // The columns this schema has no home for (AWB, consignee, pieces, contents) are kept as
      // raw metadata rather than dropped — same place the earlier recovery import put them.
      await tx.externalTrackingNumber.create({
        data: {
          shipmentId: shipment.id,
          providerId,
          externalTrackingNumber: reference,
          rawMetadata: {
            source: 'operations spreadsheet import',
            sheet: row.sheet,
            awb: row.awb,
            trkNumber: row.trkNumber,
            service: row.service,
            pickupPerson: row.pickupPerson,
            pickupPartnerId: partnerByName.get(row.pickupPerson) ?? null,
            consignor: row.consignor,
            consignorPhone: row.consignorPhone,
            consignorAddress: row.consignorAddress,
            consignee: row.consignee,
            consigneePhone: row.consigneePhone,
            consigneeAddress: row.consigneeAddress,
            pieces: row.pieces,
            weightKg: row.weightKg,
            content: row.content,
          } satisfies Prisma.InputJsonValue,
        },
      });
    });
    imported += 1;
  }

  console.log(
    `\nImported ${imported} orders/shipments; skipped ${skipped} (already present or unusable).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
