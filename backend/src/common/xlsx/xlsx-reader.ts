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

  const sheetTag = new RegExp(
    `<sheet[^>]*name="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
  ).exec(workbook)?.[0];
  if (!sheetTag) {
    const names = [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map(
      (m) => m[1],
    );
    throw new Error(
      `Sheet "${sheetName}" not found. Available: ${names.join(', ')}`,
    );
  }
  const rid = /r:id="([^"]+)"/.exec(sheetTag)?.[1];
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  if (!target)
    throw new Error(`Could not resolve the file for sheet "${sheetName}"`);
  const sheetPath = target.startsWith('/')
    ? target.slice(1)
    : `xl/${target.replace(/^\.\//, '')}`;

  const sharedXml = zip.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map(textOf);

  const sheetXml = zip.get(sheetPath)?.toString('utf8');
  if (!sheetXml)
    throw new Error(`Sheet part ${sheetPath} missing from the workbook`);

  const out: string[][] = [];
  for (const rowXml of sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const cells: Record<number, string> = {};
    for (const cellXml of rowXml.match(/<c[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ??
      []) {
      const ref = /r="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(cellXml)?.[1];
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
