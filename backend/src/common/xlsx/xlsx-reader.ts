/**
 * A minimal .xlsx reader — the counterpart of xlsx-writer.ts.
 *
 * An xlsx is a zip of XML, and Node ships zlib, so this reads one without adding a spreadsheet
 * dependency. It handles exactly what this app's sheets use: shared strings, inline strings and
 * numeric cells. It is not a general-purpose parser — no formulas, styles, dates or merged cells.
 *
 * Works on a Buffer so the same parser serves the one-off import scripts (which read a file) and
 * the admin import endpoint (which receives an upload in memory).
 */
import { inflateRawSync } from 'node:zlib';

/** Reads the zip central directory and inflates every entry. */
function readZip(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();

  // Locate the End Of Central Directory record by scanning backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new Error('Not a zip file (no end-of-central-directory record)');

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);

    // The local header repeats the name/extra lengths, and they can differ from the central
    // directory's, so the data offset must be computed from the local header itself.
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buf.subarray(start, start + compressedSize);

    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** Concatenates every <t> in a fragment — a cell's text can be split across runs. */
function textOf(fragment: string): string {
  const parts: string[] = fragment.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return parts
    .map((part) =>
      decodeEntities(part.replace(/<t[^>]*>/, '').replace(/<\/t>/, '')),
    )
    .join('');
}

/** "BC12" -> 54 (zero-based column). */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 54 -> "BC". */
function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** One attribute of a tag, wherever it sits in it. */
function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/** Every sheet name in the workbook, in tab order. */
export function listSheets(file: Buffer): string[] {
  const workbook = readZip(file).get('xl/workbook.xml')?.toString('utf8') ?? '';
  return [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) =>
    decodeEntities(m[1]),
  );
}

/** Rows of one sheet, by name; omit the name for the first sheet. */
export function readSheetFromBuffer(
  file: Buffer,
  sheetName?: string,
): string[][] {
  const zip = readZip(file);
  const name = sheetName ?? listSheets(file)[0];
  if (!name) throw new Error('This workbook has no sheets');
  return readNamedSheet(zip, name);
}

function readNamedSheet(
  zip: Map<string, Buffer>,
  sheetName: string,
): string[][] {
  const workbook = zip.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = zip.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';

  // Attributes are read one by one: openpyxl (what ChatGPT and most scripts write with) puts
  // Target before Id, and the relationships prefix is not always "r:".
  const sheetTag = [...workbook.matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => decodeEntities(attr(tag, 'name') ?? '') === sheetName);
  if (!sheetTag) {
    const names = [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map(
      (m) => m[1],
    );
    throw new Error(
      `Sheet "${sheetName}" not found. Available: ${names.join(', ')}`,
    );
  }
  const rid = /\s[\w-]+:id="([^"]+)"/.exec(sheetTag)?.[1];
  const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => attr(tag, 'Id') === rid);
  const href = target && attr(target, 'Target');
  if (!href)
    throw new Error(`Could not resolve the file for sheet "${sheetName}"`);
  const sheetPath = href.startsWith('/')
    ? href.slice(1)
    : `xl/${href.replace(/^\.\//, '')}`;

  const sharedXml = zip.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared = (sharedXml.match(/<si(?:\s*\/>|>[\s\S]*?<\/si>)/g) ?? []).map(
    textOf,
  );

  const sheetXml = zip.get(sheetPath)?.toString('utf8');
  if (!sheetXml)
    throw new Error(`Sheet part ${sheetPath} missing from the workbook`);

  const out: string[][] = [];
  // Lazy attributes, so "<row r="5"/>" ends at its own "/>" instead of running into the next row.
  for (const rowXml of sheetXml.match(
    /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g,
  ) ?? []) {
    // Writers other than Excel skip empty rows; put them back, since a blank row is what
    // separates one block of a rate sheet from the next.
    const rowNumber = Number(attr(rowXml.slice(0, rowXml.indexOf('>')), 'r'));
    while (rowNumber > out.length + 1) out.push([]);
    const cells: Record<number, string> = {};
    let next = 0;
    for (const cellXml of rowXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ??
      []) {
      // The cell reference is optional in the format; without one a cell follows the last.
      const ref = /\sr="([A-Z]+)\d*"/.exec(cellXml)?.[1] ?? columnName(next);
      next = columnIndex(ref) + 1;
      const type = attr(/^<c\b[^>]*/.exec(cellXml)![0], 't');
      let value: string;
      if (type === 's') {
        const idx = Number(/<v>(\d+)<\/v>/.exec(cellXml)?.[1] ?? '-1');
        value = shared[idx] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(cellXml);
      } else {
        value = decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? '');
      }
      cells[columnIndex(ref)] = value.trim();
    }
    const keys = Object.keys(cells).map(Number);
    const width = keys.length ? Math.max(...keys) + 1 : 0;
    out.push(Array.from({ length: width }, (_, i) => cells[i] ?? ''));
  }
  return out;
}
