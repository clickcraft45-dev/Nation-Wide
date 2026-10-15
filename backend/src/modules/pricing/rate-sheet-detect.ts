/**
 * Finds the rate tables inside a carrier's rate workbook, as the carrier sent it — notes on top,
 * several tables per sheet, section labels between them — and turns each into weight bands the
 * pricing engine can use. Pure: rows in, tables out. Nothing here touches the database.
 *
 * Two layouts cover what carriers and consolidators actually send:
 *
 *  - zone grid: one row per weight (0.5, 1, 1.5 … or "First 500 gms", "Addl 500 gms", "6-10 Kg"),
 *    one column per zone ("Zone 1", "A", "B" …). Section rows ("Document", "Non-documents") switch
 *    the shipment type for the rows under them. Each zone column becomes one zone.
 *  - country list: one row per destination + service, with columns "500 gms | ADD 500 | 6+ | 8+ …".
 *    Each row becomes one zone of the provider named by its service.
 *
 * Bands never overlap: weights are rounded to 0.01 kg (chargeableWeightKg) and the engine takes the
 * first band whose range contains the weight without sorting, so 0–0.5, 0.51–1, 1.01–1.5 is the
 * only shape that cannot be read two ways.
 */

export type RateKind = 'FLAT' | 'PER_KG';
export type SheetShipmentType = 'DOCUMENT' | 'PACKAGE';

export interface RateBand {
  weightFromKg: number;
  weightToKg: number;
  rate: number;
  rateType: RateKind;
}

export interface DetectedZone {
  name: string;
  shipmentType: SheetShipmentType;
  bands: RateBand[];
  /** Codes as written in the sheet (country list only): "KE", "BN, ID, KR", "AGT". */
  countryCodes: string[];
  /** The destination text (country list only), used to recognise the country by name. */
  destination: string | null;
  /** 1-based row in the sheet, for pointing at it in the preview. */
  row: number;
}

export interface DetectedProvider {
  code: string;
  name: string;
  zones: DetectedZone[];
}

export interface DetectedTable {
  id: string;
  sheet: string;
  kind: 'zone-grid' | 'country-list';
  title: string;
  firstRow: number;
  lastRow: number;
  providers: DetectedProvider[];
  /**
   * Zone grids only: the carrier's own country → zone list, when the sheet has one ("COUNTRY |
   * Zone", "Destination | Zone", "Countries & Territories | Zone"). Names as written.
   */
  countryMap: { country: string; code: string | null; zone: string }[];
  warnings: string[];
  /** Whether the preview should tick it by default. */
  suggested: boolean;
  /** On a sheet named "All in": its prices already include fuel and GST. */
  allIn: boolean;
  /** Remote-area surcharges or import/freight pricing: never parcel export rates. */
  excluded: boolean;
  /** The carrier was recognised, rather than guessed from the sheet name. */
  carrierKnown: boolean;
}

/** Bands above the last stated weight run to here: the engine refuses a parcel over 1000 kg. */
export const OPEN_ENDED_KG = 1000;

/** The carriers whose own grids this importer updates. A service of the same name in a country list is kept apart from them. */
const CARRIERS: { pattern: RegExp; code: string; name: string }[] = [
  { pattern: /fed\s*ex/i, code: 'FEDEX', name: 'FedEx' },
  { pattern: /\bups\b/i, code: 'UPS', name: 'UPS' },
  { pattern: /\bdhl\b/i, code: 'DHL', name: 'DHL' },
];
const CARRIER_CODES = new Set([...CARRIERS.map((c) => c.code), 'DHL_EXPRESS']);

const round2 = (n: number) => Math.round(n * 100) / 100;
const text = (cell: string | undefined) =>
  (cell ?? '').replace(/\s+/g, ' ').trim();

/** A price cell: "1,825", "₹ 1825", "1825.50". Notes ("**", "Service Suspended") are not prices. */
export function priceOf(cell: string | undefined): number | null {
  const t = text(cell).replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export type WeightLabel =
  | { kind: 'first' }
  | { kind: 'add' }
  | { kind: 'at'; kg: number }
  | { kind: 'from'; kg: number; toKg?: number };

/**
 * What a weight heading means. In a grid a bare number is the weight that row prices ("1.5" = up
 * to 1.5 kg, flat); in a country list it starts a per-kg bracket ("6" or "6+" = 6 kg and over).
 */
export function parseWeightLabel(
  cell: string | undefined,
  mode: 'grid' | 'list',
): WeightLabel | null {
  const t = text(cell).toLowerCase();
  if (!t) return null;
  if (/^(first\s*)?500\s*(g|gm|gms|gram|grams)$/.test(t))
    return { kind: 'first' };
  if (/^(add|addl|additional)\.?\s*500\s*(g|gm|gms|grams)?$/.test(t))
    return { kind: 'add' };
  const range = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(kg|kgs)?\b/.exec(t);
  if (range)
    return { kind: 'from', kg: Number(range[1]), toKg: Number(range[2]) };
  const plus = /^(\d+(?:\.\d+)?)\s*\+\s*(kg|kgs)?$/.exec(t);
  if (plus) return { kind: 'from', kg: Number(plus[1]) };
  const bare = /^(\d+(?:\.\d+)?)\s*(kg|kgs)?$/.exec(t);
  if (bare) {
    const kg = Number(bare[1]);
    if (kg <= 0 || kg > OPEN_ENDED_KG) return null;
    return mode === 'grid' ? { kind: 'at', kg } : { kind: 'from', kg };
  }
  return null;
}

/**
 * One zone's prices, in whatever form the sheet gave them, as non-overlapping bands:
 *  - "500 gms" + "ADD 500" expand into a flat band per extra half kilo, up to the first per-kg
 *    bracket — the same price the carrier's own calculation gives, with no new rate type;
 *  - a grid weight is a flat price up to that weight;
 *  - "N+" / "N-M kg" is a per-kg rate from that weight.
 * A heading with no price ("**", "Service suspended") simply leaves a gap: the engine then offers
 * no price for those weights rather than a made-up one.
 */
export function buildBands(
  points: { label: WeightLabel; price: number | null }[],
): RateBand[] {
  const first =
    points.find((p) => p.label.kind === 'first')?.price ?? undefined;
  const add = points.find((p) => p.label.kind === 'add')?.price ?? undefined;
  const ats = points
    .filter(
      (p): p is { label: { kind: 'at'; kg: number }; price: number } =>
        p.label.kind === 'at' && p.price !== null,
    )
    .sort((a, b) => a.label.kg - b.label.kg);
  // Unpriced brackets stay in the list: "8+ → Receiver nationality only" still ends the 6+ bracket
  // at 7.99 kg, rather than letting the 6+ rate run on to 1000 kg.
  const froms = points
    .filter(
      (
        p,
      ): p is {
        label: { kind: 'from'; kg: number; toKg?: number };
        price: number | null;
      } => p.label.kind === 'from',
    )
    .sort((a, b) => a.label.kg - b.label.kg);

  const bands: RateBand[] = [];
  // The top of the last band, or null before the first one.
  let top: number | null = null;
  const push = (to: number, rate: number, rateType: RateKind) => {
    const from = top === null ? 0 : round2(top + 0.01);
    if (to < from) return;
    bands.push({
      weightFromKg: from,
      weightToKg: round2(to),
      rate: round2(rate),
      rateType,
    });
    top = round2(to);
  };

  if (first !== undefined) push(0.5, first, 'FLAT');
  for (const at of ats) {
    if (top !== null && at.label.kg <= top) continue;
    push(at.label.kg, at.price, 'FLAT');
  }
  if (
    first !== undefined &&
    add !== undefined &&
    froms.length > 0 &&
    top !== null
  ) {
    // Half-kilo steps up to just below the first bracket ("6+" → 1, 1.5 … 5.5 kg).
    for (let kg = 1; kg <= froms[0].label.kg - 0.5 + 1e-9; kg += 0.5) {
      push(kg, first + add * ((kg - 0.5) / 0.5), 'FLAT');
    }
  }
  froms.forEach((f, i) => {
    const next = froms[i + 1];
    const to = f.label.toKg ?? (next ? next.label.kg - 0.01 : OPEN_ENDED_KG);
    if (f.price === null) {
      // A gap: nothing is priced here, and the next bracket starts after it.
      if (top !== null) top = round2(Math.max(top, to));
      return;
    }
    // A bracket with no price before it ("**" for small parcels) starts at its own weight.
    if (top === null) top = round2(f.label.kg - 0.01);
    push(to, f.price, 'PER_KG');
  });
  return bands;
}

function shipmentTypeOf(cell: string): SheetShipmentType | null {
  const t = cell.toLowerCase();
  if (/non[\s-]*doc|package|parcel|\bspx\b|\bwpx\b/.test(t)) return 'PACKAGE';
  if (/\bdoc|letter|envelope|\bdox\b/.test(t)) return 'DOCUMENT';
  return null;
}

function carrierOf(...hints: string[]) {
  for (const hint of hints) {
    const hit = CARRIERS.find((c) => c.pattern.test(hint));
    if (hit) return hit;
  }
  return null;
}

const slug = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

const nonEmpty = (row: string[] | undefined) =>
  (row ?? []).filter((c) => text(c)).length;

// A grid header names zones: "Zone 1", "ZONE 3", or FedEx's single letters.
const ZONE_HEADER = /^(zone\s*[a-z0-9]{1,3}|[a-z])$/i;

/**
 * A country-list header: at least two headings only a header has ("500 gms", "ADD 500", "6+") and
 * no prices. A row of prices parses as weights too, and "6-10 Kg | 805 | 805" is a grid row.
 */
function isListHeader(row: string[]): boolean {
  const marked = row.filter((c) => {
    const l = parseWeightLabel(c, 'list');
    return (
      l?.kind === 'first' ||
      l?.kind === 'add' ||
      (l?.kind === 'from' && /\+/.test(text(c)))
    );
  }).length;
  const prices = row.filter(
    (c) => priceOf(c) !== null && Number(text(c)) > 100,
  ).length;
  return (
    marked >= 2 &&
    prices === 0 &&
    row.filter((c) => parseWeightLabel(c, 'list')).length >= 3
  );
}

export function detectRateTables(
  sheet: string,
  rows: string[][],
): DetectedTable[] {
  const tables: DetectedTable[] = [];
  const used = new Set<number>();
  const sheetIsCopy = /all\s*in/i.test(sheet);
  const sheetIsRemote = /remote/i.test(sheet);

  for (let r = 0; r < rows.length; r++) {
    if (used.has(r)) continue;
    const row = rows[r] ?? [];
    const zoneHeaders = row.filter((c) => ZONE_HEADER.test(text(c))).length;

    const table =
      zoneHeaders >= 3
        ? gridAt(sheet, rows, r)
        : isListHeader(row)
          ? listAt(sheet, rows, r)
          : null;
    if (!table) continue;
    for (let i = table.firstRow - 1; i < table.lastRow; i++) used.add(i);
    table.allIn = sheetIsCopy;
    if (sheetIsCopy) {
      table.suggested = false;
      table.warnings.unshift(
        'This sheet repeats another one with GST included. Import the pre-GST sheet instead.',
      );
    }
    if (
      table.kind === 'country-list' &&
      /import|freight|baggage/i.test(table.title)
    ) {
      table.suggested = false;
      table.excluded = true;
      table.warnings.unshift(
        'Looks like import or freight pricing, not export parcel rates. Not ticked.',
      );
    }
    if (sheetIsRemote) {
      table.suggested = false;
      table.excluded = true;
      table.warnings.unshift(
        'Remote-area charges are a surcharge, not a rate card. Not ticked.',
      );
    }
    tables.push(table);
    r = table.lastRow - 1;
  }

  // The carrier's country → zone list applies to every grid on its sheet.
  const countryMap = zoneMapOf(rows);
  for (const table of tables)
    if (table.kind === 'zone-grid') table.countryMap = countryMap;
  return tables;
}

/**
 * "COUNTRY | Zone", "Destination | Zone" or "Countries & Territories | Zone", repeated across the
 * sheet in column pairs. "Afghanistan (AF) | 11" → Afghanistan, AF, Zone 11; "Aruba | J" → J.
 */
function zoneMapOf(rows: string[][]): DetectedTable['countryMap'] {
  const entries: DetectedTable['countryMap'] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const pairs = row
      .map((_, c) => c)
      .filter(
        (c) =>
          /^(countr|destination)/i.test(text(row[c])) &&
          /^zone$/i.test(text(row[c + 1])),
      );
    if (pairs.length === 0) continue;
    for (r = r + 1; r < rows.length; r++) {
      const data = rows[r] ?? [];
      if (pairs.every((c) => !text(data[c]))) break;
      for (const c of pairs) {
        const raw = text(data[c]);
        const zone = text(data[c + 1]);
        if (!raw || !zone) continue;
        const code = /\(([A-Z]{2})\)\s*$/.exec(raw)?.[1] ?? null;
        const country = raw
          .replace(/\(([A-Z]{2})\)\s*$/, '')
          .replace(/\*+/g, '')
          .trim();
        entries.push({
          country,
          code,
          zone: /^\d+$/.test(zone) ? `Zone ${zone}` : zone.toUpperCase(),
        });
      }
    }
  }
  return entries;
}

function gridAt(
  sheet: string,
  rows: string[][],
  headerIndex: number,
): DetectedTable | null {
  const header = rows[headerIndex];
  // The rows under the header up to the first blank one: a short table ("30.1-50", "50.1-70") is
  // often followed straight away by something else, whose numbers must not count.
  const sample: string[][] = [];
  for (
    let r = headerIndex + 1;
    r < rows.length && sample.length < 8 && nonEmpty(rows[r]) > 0;
    r++
  )
    sample.push(rows[r]);

  // Zones start at the first zone heading; the weight column is somewhere to its left. (Weights
  // are numbers too, so "mostly numeric" alone would take the weight column for a zone.)
  const firstZoneCol = header.findIndex((c) => ZONE_HEADER.test(text(c)));
  const zoneCols: number[] = [];
  header.forEach((cell, c) => {
    if (
      c < firstZoneCol ||
      !text(cell) ||
      /service|vendor|weight|^kg$/i.test(text(cell))
    )
      return;
    // A column headed "Zone N" is a zone whatever is under it; anything else ("AU", "Zone 6
    // Special") has to show prices underneath to count.
    if (ZONE_HEADER.test(text(cell))) {
      zoneCols.push(c);
      return;
    }
    const priced = sample.filter((row) => priceOf(row[c]) !== null).length;
    if (priced >= Math.max(Math.min(2, sample.length), sample.length / 2))
      zoneCols.push(c);
  });
  if (zoneCols.length < 2) return null;

  // "From | To" columns give per-kg ranges ("30.1 | 50"); otherwise the weight column is the one
  // left of the zones whose cells read as weights most often.
  const fromCol = header.findIndex(
    (c, i) => i < firstZoneCol && /^from$/i.test(text(c)),
  );
  const toCol = header.findIndex(
    (c, i) => i < firstZoneCol && /^to$/i.test(text(c)),
  );
  const ranged = fromCol >= 0 && toCol >= 0;
  let weightCol = ranged ? fromCol : -1;
  let best = ranged ? sample.length : 0;
  for (let c = 0; c < firstZoneCol && !ranged; c++) {
    const hits = sample.filter((row) =>
      parseWeightLabel(row[c], 'grid'),
    ).length;
    if (hits > best) {
      best = hits;
      weightCol = c;
    }
  }
  if (weightCol < 0 || best < 2) return null;
  const labelOf = (row: string[]): WeightLabel | null => {
    if (!ranged) return parseWeightLabel(row[weightCol], 'grid');
    const from = Number(text(row[fromCol]));
    const to = Number(text(row[toCol]));
    return from > 0 && to > from ? { kind: 'from', kg: from, toKg: to } : null;
  };

  // The shipment type is often stated just above the header ("Documents up to 2 kg").
  let shipmentType: SheetShipmentType = 'PACKAGE';
  for (const row of [
    ...rows.slice(Math.max(0, headerIndex - 3), headerIndex + 1),
  ]) {
    for (const cell of row ?? []) {
      const type = shipmentTypeOf(text(cell));
      if (type) shipmentType = type;
    }
  }

  const series = new Map<
    string,
    {
      zone: string;
      type: SheetShipmentType;
      points: { label: WeightLabel; price: number }[];
    }
  >();
  const serviceHints: string[] = [];
  let lastRow = headerIndex + 1;
  let misses = 0;
  for (let r = headerIndex + 1; r < rows.length && misses < 3; r++) {
    const row = rows[r] ?? [];
    if (row.filter((c) => ZONE_HEADER.test(text(c))).length >= 3) {
      // The same header again under a new section continues this table; a different layout
      // ("From | To | Zone 1 …" with the zones moved over) is a table of its own.
      const same = zoneCols.every(
        (c) => text(row[c]).toLowerCase() === text(header[c]).toLowerCase(),
      );
      if (!same) break;
      misses = 0;
      continue;
    }
    const label = labelOf(row);
    const prices = zoneCols.map((c) => priceOf(row[c]));
    const others = row
      .map(text)
      .filter((cell, c) => cell && c !== weightCol && !zoneCols.includes(c));
    // Section labels ("Package", "Non-documents …") usually sit in the weight column itself.
    for (const cell of label ? others : row.map(text)) {
      const type = shipmentTypeOf(cell);
      if (type) shipmentType = type;
    }
    if (!label || prices.every((p) => p === null)) {
      if (nonEmpty(row) === 0 || others.length > 0) misses += 1;
      // A row that is all prices with no weight is the start of something else.
      if (prices.some((p) => p !== null)) break;
      continue;
    }
    misses = 0;
    lastRow = r + 1;
    serviceHints.push(...others);
    zoneCols.forEach((c, i) => {
      const price = prices[i];
      if (price === null) return;
      const zone = zoneName(text(header[c]));
      const key = `${shipmentType}|${zone}`;
      if (!series.has(key))
        series.set(key, { zone, type: shipmentType, points: [] });
      series.get(key)!.points.push({ label, price });
    });
  }

  const zones: DetectedZone[] = [...series.values()]
    .map((s) => ({
      name: s.zone,
      shipmentType: s.type,
      bands: buildBands(s.points),
      // A column named by country codes ("AU", "PL , CZ , RO") or listing them ("ZONE 6 SPECIALS -
      // (NC/MU/MV)") is those countries' own rate.
      countryCodes: codesInZoneName(s.zone),
      destination: null,
      row: headerIndex + 1,
    }))
    .filter((z) => z.bands.length > 0);
  if (zones.length === 0) return null;

  const carrier = carrierOf(sheet, ...serviceHints);
  const warnings: string[] = [];
  const title = text(rows[headerIndex - 1]?.find((c) => text(c))) || sheet;
  const provider = carrier
    ? { code: carrier.code, name: carrier.name }
    : { code: slug(sheet), name: sheet };
  if (!carrier) {
    warnings.push(
      `Couldn't tell which carrier this grid belongs to, so it would become a new provider "${sheet}". Not ticked.`,
    );
  }
  return {
    id: `${sheet}!${headerIndex + 1}`,
    sheet,
    kind: 'zone-grid',
    title,
    firstRow: headerIndex + 1,
    lastRow,
    providers: [{ ...provider, zones }],
    countryMap: [],
    warnings,
    suggested: Boolean(carrier),
    allIn: false,
    excluded: false,
    carrierKnown: Boolean(carrier),
  };
}

function codesInZoneName(zone: string): string[] {
  if (/^[A-Z]{2}(\s*[,/]\s*[A-Z]{2})*$/.test(zone))
    return zone.split(/\s*[,/]\s*/);
  const listed = /\(([A-Z]{2}(?:\s*[,/]\s*[A-Z]{2})+)\)/.exec(zone);
  return listed ? listed[1].split(/\s*[,/]\s*/) : [];
}

/** "ZONE 1" and "Zone 1" are the same zone; single letters stay as they are. */
function zoneName(header: string): string {
  const m = /^zone\s*([a-z0-9]{1,3})$/i.exec(header);
  return m ? `Zone ${m[1].toUpperCase()}` : header.toUpperCase();
}

// Vendor codes look like TC1, R002, F001, LP25; a service is words (SELF, DUTY PAID).
const VENDOR_CODE = /^[A-Z]{1,4}\d{1,4}$/;

function listAt(
  sheet: string,
  rows: string[][],
  headerIndex: number,
): DetectedTable | null {
  const header = rows[headerIndex];
  const priceCols: { col: number; label: WeightLabel }[] = [];
  header.forEach((cell, col) => {
    const label = parseWeightLabel(cell, 'list');
    if (label) priceCols.push({ col, label });
  });

  // The descriptive columns are named on this row or the one above ("Dest_Code | Service Code |
  // Vendor" sits above "Destination" in half the sections).
  const find = (pattern: RegExp, fallback: number) => {
    for (const row of [header, rows[headerIndex - 1] ?? []]) {
      const at = row.findIndex((c) => pattern.test(text(c)));
      if (at >= 0 && !priceCols.some((p) => p.col === at)) return at;
    }
    return fallback;
  };
  const codeCol = find(/dest[\s_]*code/i, 0);
  let serviceCol = find(/service\s*code/i, 1);
  let vendorCol = find(/^vendor$/i, 2);
  // "Destination" on the weight row is often a label over the code column, not the name column.
  const namedDest = find(/^destination$/i, 3);
  const destCol = namedDest === codeCol ? 3 : namedDest;

  const above = rows[headerIndex - 1] ?? [];
  const title =
    text(above[destCol]) && !/destination/i.test(text(above[destCol]))
      ? text(above[destCol])
      : text(
          above.find((c) => text(c) && !/dest|service|vendor/i.test(text(c))),
        ) || sheet;

  const providers = new Map<string, DetectedProvider>();
  const warnings: string[] = [];
  let lastRow = headerIndex + 1;

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (nonEmpty(row) === 0) break;
    if (isListHeader(row)) break; // the next section
    lastRow = r + 1;

    let service = text(row[serviceCol]).toUpperCase();
    let vendor = text(row[vendorCol]).toUpperCase();
    // Some sections swap the two columns (ROW: "AGT | TC1 | SELF").
    if (VENDOR_CODE.test(service) && !VENDOR_CODE.test(vendor)) {
      [service, vendor] = [vendor, service];
      [serviceCol, vendorCol] = [vendorCol, serviceCol];
    }
    const destination = text(row[destCol]);
    const codes = text(row[codeCol])
      .toUpperCase()
      .split(/[,/]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    const points = priceCols.map(({ col, label }) => ({
      label,
      price: priceOf(row[col]),
    }));
    if (!service || !destination) continue; // notes, "CLICK FOR …" links
    if (points.every((p) => p.price === null)) {
      warnings.push(
        `Row ${r + 1} (${destination}, ${service}): no prices, skipped.`,
      );
      continue;
    }
    const bands = buildBands(points);
    if (bands.length === 0) {
      warnings.push(
        `Row ${r + 1} (${destination}, ${service}): prices could not be turned into weight bands, skipped.`,
      );
      continue;
    }

    let code = slug(service);
    let name = service;
    // A consolidator's "FEDEX" service is its own price list, not the carrier's grid.
    if (CARRIER_CODES.has(code)) {
      code = `${code}_${slug(sheet)}`;
      name = `${service} (${sheet})`;
    }
    if (!providers.has(code)) providers.set(code, { code, name, zones: [] });
    const provider = providers.get(code)!;

    const base = /^zone\s*\w+$/i.test(destination)
      ? `${codes.join(' ')} ${destination}`.trim()
      : destination;
    let zone = base;
    for (let n = 2; provider.zones.some((z) => z.name === zone); n++)
      zone = `${base} (${n})`;
    if (zone !== base)
      warnings.push(
        `Row ${r + 1}: "${base}" appears twice for ${service}; the second is "${zone}".`,
      );

    provider.zones.push({
      name: zone,
      shipmentType: 'PACKAGE',
      bands,
      countryCodes: codes,
      destination,
      row: r + 1,
    });
  }

  if (providers.size === 0) return null;
  return {
    id: `${sheet}!${headerIndex + 1}`,
    sheet,
    kind: 'country-list',
    title,
    firstRow: headerIndex + 1,
    lastRow,
    providers: [...providers.values()],
    countryMap: [],
    warnings,
    suggested: true,
    allIn: false,
    excluded: false,
    carrierKnown: true,
  };
}
