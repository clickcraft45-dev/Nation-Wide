import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Country, RateProvider } from '@prisma/client';
import type {
  ProviderRateSheetDto,
  RateGridDto,
  RateSheetApplyResultDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { listSheets, readSheetFromBuffer } from '../../common/xlsx/xlsx-reader';
import { buildWorkbook, type Cell } from '../../common/xlsx/xlsx-writer';
import {
  detectRateTables,
  type DetectedTable,
  type DetectedZone,
  type RateBand,
  type SheetShipmentType,
} from './rate-sheet-detect';

/**
 * A provider's rate sheet, in and out. The admin picks the provider and uploads the workbook the
 * carrier sent; the rate tables are found (rate-sheet-detect), shown against the live rates as the
 * same weight × zone grid the sheet has, and on apply every band of that provider is brought in
 * line with the sheet. Preview and apply build the same plan, so the preview never shows something
 * the import would not do.
 *
 * Zones still exist underneath, because a sheet's columns ARE its zones and that is how a country
 * finds its price. They are created and linked from the sheet; nobody has to manage them by hand.
 *
 * Safe by default:
 *  - nothing is deleted. A band the new sheet no longer has is switched off, which keeps every
 *    past quote that points at it intact;
 *  - a zone the sheet does not mention is left exactly as it is;
 *  - a country is only linked when the sheet names it unambiguously.
 */
@Injectable()
export class RateSheetImportService {
  private readonly logger = new Logger(RateSheetImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The provider's live rates, laid out like the carrier's sheet. */
  async current(providerId: string): Promise<ProviderRateSheetDto> {
    const provider = await this.provider(providerId);
    return sheetView(provider, await this.liveCards(provider.id), null, [], []);
  }

  /**
   * The live rates as a workbook: the same grid, then the country → zone list. Upload it back
   * (edited or not) and it reads as this provider's sheet.
   */
  async export(providerId: string): Promise<{ name: string; file: Buffer }> {
    const provider = await this.provider(providerId);
    const view = sheetView(
      provider,
      await this.liveCards(provider.id),
      null,
      [],
      [],
    );
    const links = await this.prisma.zoneCountry.findMany({
      where: { rateProviderId: provider.id },
      include: { zone: true, country: true },
      orderBy: [{ zone: { name: 'asc' } }, { country: { name: 'asc' } }],
    });
    const allIn = view.grids.some((g) => g.allIn);
    return {
      name: `${provider.code.toLowerCase()}-rates`,
      file: buildWorkbook([
        {
          // The code, not the name: an unrecognised sheet becomes a provider coded by its sheet
          // name, so naming it by the code is what makes the upload land on this provider again.
          name: `${provider.code.slice(0, 24)}${allIn ? ' All in' : ''}`,
          rows: exportRows(
            provider.name,
            view.grids,
            links.map((l) => ({
              country: l.country.name,
              code: l.country.code,
              zone: l.zone.name,
            })),
          ),
        },
      ]),
    };
  }

  /** What uploading this sheet would change, cell by cell. Writes nothing. */
  async preview(
    providerId: string,
    file: Buffer,
    allIn: boolean,
  ): Promise<ProviderRateSheetDto> {
    const provider = await this.provider(providerId);
    const { plan, sources, warnings } = await this.planFor(
      provider,
      file,
      allIn,
    );
    return sheetView(
      provider,
      await this.liveCards(provider.id),
      { plan, allIn },
      sources,
      warnings,
    );
  }

  async import(
    providerId: string,
    file: Buffer,
    options: { allIn: boolean; gstPercent: number },
    actorId: string,
  ): Promise<RateSheetApplyResultDto> {
    if (!(options.gstPercent >= 0 && options.gstPercent <= 100)) {
      throw new BadRequestException('GST % must be between 0 and 100.');
    }
    const provider = await this.provider(providerId);
    const { plan, warnings } = await this.planFor(
      provider,
      file,
      options.allIn,
    );
    const planned = plan.providers.get(provider.code)!;
    const result: RateSheetApplyResultDto = {
      zonesCreated: 0,
      bandsCreated: 0,
      bandsUpdated: 0,
      bandsDeactivated: 0,
      countriesLinked: 0,
      warnings,
    };

    // One transaction: a rate book half-written is worse than either the old one or the new one.
    await this.prisma.$transaction(
      async (tx) => {
        const zonesInDb = await tx.zone.findMany({
          where: { rateProviderId: provider.id },
        });

        for (const z of planned.zones.values()) {
          let zone = zonesInDb.find(
            (row) => row.name.toLowerCase() === z.name.toLowerCase(),
          );
          if (!zone) {
            zone = await tx.zone.create({
              data: { rateProviderId: provider.id, name: z.name },
            });
            zonesInDb.push(zone);
            result.zonesCreated += 1;
          }

          for (const [shipmentType, bands] of z.cards) {
            let card = await tx.rateCard.findUnique({
              where: {
                zoneId_shipmentType: { zoneId: zone.id, shipmentType },
              },
            });
            if (!card) {
              card = await tx.rateCard.create({
                data: {
                  zoneId: zone.id,
                  shipmentType,
                  currency: 'INR',
                  taxInclusive: options.allIn,
                  createdByAdminId: actorId,
                },
              });
            } else if (card.taxInclusive !== options.allIn) {
              await tx.rateCard.update({
                where: { id: card.id },
                data: { taxInclusive: options.allIn },
              });
            }
            const slabs = await tx.weightSlab.findMany({
              where: { rateCardId: card.id },
            });
            const byRange = new Map(
              slabs.map((s) => [rangeKey(s.weightFromKg, s.weightToKg), s]),
            );
            const kept = new Set<string>();
            const fresh: RateBand[] = [];
            for (const band of bands) {
              const existing = byRange.get(
                rangeKey(band.weightFromKg, band.weightToKg),
              );
              if (!existing) {
                fresh.push(band);
                continue;
              }
              kept.add(existing.id);
              const changed =
                existing.baseRate !== band.rate ||
                existing.rateType !== band.rateType ||
                existing.gstPercent !== options.gstPercent ||
                !existing.isActive;
              if (!changed) continue;
              // nationwideCut is left alone: it is NationWide's margin, not the carrier's price.
              await tx.weightSlab.update({
                where: { id: existing.id },
                data: {
                  baseRate: band.rate,
                  rateType: band.rateType,
                  gstPercent: options.gstPercent,
                  isActive: true,
                  updatedByAdminId: actorId,
                },
              });
              result.bandsUpdated += 1;
            }
            if (fresh.length > 0) {
              await tx.weightSlab.createMany({
                data: fresh.map((band) => ({
                  rateCardId: card.id,
                  weightFromKg: band.weightFromKg,
                  weightToKg: band.weightToKg,
                  baseRate: band.rate,
                  rateType: band.rateType,
                  gstPercent: options.gstPercent,
                  createdByAdminId: actorId,
                })),
              });
              result.bandsCreated += fresh.length;
            }
            const stale = slabs
              .filter((s) => s.isActive && !kept.has(s.id))
              .map((s) => s.id);
            if (stale.length > 0) {
              await tx.weightSlab.updateMany({
                where: { id: { in: stale } },
                data: { isActive: false, updatedByAdminId: actorId },
              });
              result.bandsDeactivated += stale.length;
            }
          }

          for (const country of z.countries.values()) {
            const link = await tx.zoneCountry.findUnique({
              where: {
                rateProviderId_countryId: {
                  rateProviderId: provider.id,
                  countryId: country.id,
                },
              },
            });
            if (link?.zoneId === zone.id) continue;
            if (link) {
              await tx.zoneCountry.update({
                where: { id: link.id },
                data: { zoneId: zone.id },
              });
            } else {
              await tx.zoneCountry.create({
                data: {
                  zoneId: zone.id,
                  countryId: country.id,
                  rateProviderId: provider.id,
                },
              });
            }
            result.countriesLinked += 1;
          }
        }

        await tx.auditLog.create({
          data: {
            actorId,
            action: 'IMPORT',
            entity: 'RateSheet',
            entityId: randomUUID(),
            after: {
              providerId: provider.id,
              allIn: options.allIn,
              gstPercent: options.gstPercent,
              zonesCreated: result.zonesCreated,
              bandsCreated: result.bandsCreated,
              bandsUpdated: result.bandsUpdated,
              bandsDeactivated: result.bandsDeactivated,
              countriesLinked: result.countriesLinked,
            },
          },
        });
      },
      { timeout: 300_000, maxWait: 10_000 },
    );

    this.logger.log(
      `Rate sheet for ${provider.code} by ${actorId} (${options.allIn ? 'all-in' : 'normal'}): ` +
        `${result.bandsCreated} bands created, ${result.bandsUpdated} updated, ${result.bandsDeactivated} switched off`,
    );
    return result;
  }

  private async provider(id: string): Promise<RateProvider> {
    const provider = await this.prisma.rateProvider.findUnique({
      where: { id },
    });
    if (!provider) throw new NotFoundException('That provider does not exist.');
    return provider;
  }

  private liveCards(providerId: string): Promise<LiveCard[]> {
    return this.prisma.rateCard.findMany({
      where: {
        zone: { rateProviderId: providerId },
        shipmentType: { in: ['DOCUMENT', 'PACKAGE'] },
      },
      include: {
        zone: true,
        weightSlabs: {
          where: { isActive: true },
          orderBy: { weightFromKg: 'asc' },
        },
      },
    });
  }

  private async planFor(
    provider: RateProvider,
    file: Buffer,
    allIn: boolean,
  ): Promise<{ plan: Plan; sources: string[]; warnings: string[] }> {
    const tables = this.read(file);
    const picked = pickTables(tables, provider, allIn);
    if (picked.tables.length === 0) {
      const found = [
        ...new Set(tables.flatMap((t) => t.providers.map((p) => p.name))),
      ];
      throw new BadRequestException(
        `No ${provider.name} rates found in this file. It has rates for: ${found.join(', ')}. ` +
          `Pick that provider, or upload ${provider.name}'s own sheet.`,
      );
    }
    const matcher = new CountryMatcher(await this.prisma.country.findMany());
    const plan = buildPlan(picked.tables, matcher);
    const warnings = [...picked.warnings, ...plan.warnings];
    if (plan.unmatched.length > 0) {
      const n = plan.unmatched.length;
      warnings.push(
        `${n} destination${n === 1 ? '' : 's'} in the sheet could not be matched to a country, so customers there won't get these rates: ` +
          `${plan.unmatched.slice(0, 8).join(', ')}${n > 8 ? ', …' : ''}.`,
      );
    }
    return {
      plan,
      sources: picked.tables.map(
        (t) => `${t.sheet}, rows ${t.firstRow}–${t.lastRow}`,
      ),
      warnings,
    };
  }

  private read(file: Buffer): DetectedTable[] {
    let sheets: string[];
    try {
      sheets = listSheets(file);
    } catch (error) {
      throw new BadRequestException(
        `That file could not be read as a spreadsheet (${(error as Error).message}).`,
      );
    }
    const tables = sheets.flatMap((sheet) =>
      detectRateTables(sheet, readSheetFromBuffer(file, sheet)),
    );
    if (tables.length === 0) {
      throw new BadRequestException(
        'No rate tables found. The sheet needs a weight column with one column per zone, or a list of destinations with "500 gms / ADD 500 / 6+" columns.',
      );
    }
    return tables;
  }
}

interface LiveCard {
  shipmentType: string;
  taxInclusive: boolean;
  zone: { name: string };
  weightSlabs: {
    weightFromKg: number;
    weightToKg: number;
    baseRate: number;
    rateType: 'FLAT' | 'PER_KG';
  }[];
}

/**
 * The tables in a workbook that belong to the chosen provider, renamed to it.
 *
 * Carriers are recognised by name (sheet, title, service column). A file whose grids name no
 * carrier at all is taken to be this provider's own sheet, since the admin picked it. When a
 * workbook has both a normal and an "All in" version, the toggle decides which is read.
 */
export function pickTables(
  tables: DetectedTable[],
  provider: { code: string; name: string },
  allIn: boolean,
): { tables: DetectedTable[]; warnings: string[] } {
  const code = provider.code.toUpperCase();
  const usable = tables.filter((t) => !t.excluded);
  const matching = (keep: (p: { code: string }) => boolean) =>
    usable.flatMap((t) => {
      const providers = t.providers.filter(keep);
      return providers.length > 0 ? [{ ...t, providers }] : [];
    });

  let pool = matching((p) => p.code === code);
  // DHL_EXPRESS reads the DHL grid; a consolidator's own "FEDEX" service list is FEDEX_<sheet>.
  if (pool.length === 0)
    pool = matching(
      (p) => p.code.startsWith(`${code}_`) || code.startsWith(`${p.code}_`),
    );
  const warnings: string[] = [];
  if (pool.length === 0) {
    pool = usable.filter((t) => !t.carrierKnown);
    if (pool.length === 0 && usable.length === 1) pool = usable;
    if (pool.length > 0)
      warnings.push(
        `The file doesn't name ${provider.name} anywhere, so its unlabelled rate table (${pool.map((t) => `${t.sheet}, row ${t.firstRow}`).join('; ')}) was read as ${provider.name}'s. Check the columns below before applying.`,
      );
  }

  const sameKind = pool.filter((t) => t.allIn === allIn);
  if (sameKind.length > 0) pool = sameKind;
  else if (!allIn && pool.some((t) => t.allIn)) {
    warnings.push(
      'This sheet is marked "All in" but Normal is selected, so fuel and GST would be added on top of prices that already include them. Switch to All-in if that is what the carrier sent.',
    );
  }

  return {
    tables: pool.map((t) => ({
      ...t,
      providers: t.providers.map((p) => ({
        ...p,
        code: provider.code,
        name: provider.name,
      })),
    })),
    warnings,
  };
}

/**
 * The grids as rows the detector reads back: a title naming the shipment type, a "Weight (kg)"
 * header, one row per band (the band's top weight for a flat price, "from-to" for a per-kg one),
 * then "Country | Zone". Every grid gets the same columns, so the document grid continues the
 * package grid's column layout rather than starting a new one.
 */
export function exportRows(
  providerName: string,
  grids: RateGridDto[],
  links: { country: string; code: string; zone: string }[],
): Cell[][] {
  const columns = [...new Set(grids.flatMap((g) => g.columns))];
  const rows: Cell[][] = [];
  for (const grid of grids) {
    const at = columns.map((c) => grid.columns.indexOf(c));
    rows.push([
      `${providerName} ${grid.shipmentType === 'DOCUMENT' ? 'Document' : 'Package'} rates${grid.allIn ? ' (all-in)' : ''}`,
    ]);
    rows.push(['Weight (kg)', ...columns]);
    for (const row of grid.rows) {
      const perKg = row.cells.some((c) => c.old !== null && c.perKg);
      rows.push([
        perKg ? `${row.fromKg}-${row.toKg}` : row.toKg,
        ...at.map((i) => (i < 0 ? '' : (row.cells[i].old ?? ''))),
      ]);
    }
    rows.push([]);
  }
  rows.push(['Country', 'Zone']);
  for (const link of links)
    rows.push([`${link.country} (${link.code})`, link.zone]);
  return rows;
}

const naturally = (a: string, b: string) =>
  a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/**
 * The provider's rates as the sheet lays them out: one grid per shipment type, weight bands down,
 * zones across. With an upload, each cell carries the live rate and the rate after applying it. A
 * zone or type the upload does not mention keeps its live rates, exactly as the import leaves it.
 */
export function sheetView(
  provider: { id: string; code: string; name: string },
  live: LiveCard[],
  upload: { plan: Plan; allIn: boolean } | null,
  sources: string[],
  warnings: string[],
): ProviderRateSheetDto {
  const planned = upload?.plan.providers.get(provider.code);
  const summary = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  const grids: RateGridDto[] = [];

  for (const type of ['PACKAGE', 'DOCUMENT'] as const) {
    interface Col {
      name: string;
      live: LiveCard['weightSlabs'];
      sheet?: RateBand[];
      wasAllIn: boolean;
    }
    const cols = new Map<string, Col>();
    for (const z of planned?.zones.values() ?? []) {
      const bands = z.cards.get(type);
      if (bands)
        cols.set(z.name.toLowerCase(), {
          name: z.name,
          live: [],
          sheet: bands,
          wasAllIn: false,
        });
    }
    const liveOnly: Col[] = [];
    for (const card of live.filter((c) => c.shipmentType === type)) {
      const col = cols.get(card.zone.name.toLowerCase());
      if (col) {
        col.live = card.weightSlabs;
        col.wasAllIn = card.taxInclusive;
      } else if (card.weightSlabs.length > 0) {
        liveOnly.push({
          name: card.zone.name,
          live: card.weightSlabs,
          wasAllIn: card.taxInclusive,
        });
      }
    }
    // Sheet order first (as the carrier lays it out), then anything only the database has.
    const columns = [
      ...cols.values(),
      ...liveOnly.sort((a, b) => naturally(a.name, b.name)),
    ];
    if (columns.length === 0) continue;

    const ranges = new Map<string, { fromKg: number; toKg: number }>();
    for (const col of columns) {
      for (const r of [
        ...col.live.map((s) => ({
          fromKg: s.weightFromKg,
          toKg: s.weightToKg,
        })),
        ...(col.sheet ?? []).map((b) => ({
          fromKg: b.weightFromKg,
          toKg: b.weightToKg,
        })),
      ])
        ranges.set(rangeKey(r.fromKg, r.toKg), r);
    }

    const rows = [...ranges.values()]
      .sort((a, b) => a.fromKg - b.fromKg || a.toKg - b.toKg)
      .map((range) => {
        const key = rangeKey(range.fromKg, range.toKg);
        const cells = columns.map((col) => {
          const was = col.live.find(
            (s) => rangeKey(s.weightFromKg, s.weightToKg) === key,
          );
          const old = was
            ? { rate: was.baseRate, perKg: was.rateType === 'PER_KG' }
            : null;
          if (!upload) {
            return {
              old: old?.rate ?? null,
              new: null,
              perKg: old?.perKg ?? false,
              changed: false,
            };
          }
          const band = col.sheet?.find(
            (b) => rangeKey(b.weightFromKg, b.weightToKg) === key,
          );
          // A column the sheet doesn't cover keeps its live rate: the import leaves it alone.
          const next = col.sheet
            ? band
              ? { rate: band.rate, perKg: band.rateType === 'PER_KG' }
              : null
            : old;
          const changed =
            old?.rate !== next?.rate || old?.perKg !== next?.perKg;
          if (!old && next) summary.added += 1;
          else if (old && !next) summary.removed += 1;
          else if (changed) summary.changed += 1;
          else if (old) summary.unchanged += 1;
          return {
            old: old?.rate ?? null,
            new: next?.rate ?? null,
            perKg: (next ?? old)?.perKg ?? false,
            changed,
          };
        });
        return { ...range, cells };
      });

    const wasAllIn = columns.some((c) => c.wasAllIn);
    grids.push({
      shipmentType: type,
      allIn: upload ? upload.allIn : wasAllIn,
      wasAllIn,
      columns: columns.map((c) => c.name),
      rows,
    });
  }

  return {
    providerId: provider.id,
    providerCode: provider.code,
    providerName: provider.name,
    compare: Boolean(upload),
    grids,
    summary,
    sources,
    warnings,
  };
}

const rangeKey = (from: number, to: number) =>
  `${from.toFixed(2)}|${to.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface PlanZone {
  name: string;
  cards: Map<SheetShipmentType, RateBand[]>;
  countries: Map<string, Country>;
}
interface PlanProvider {
  code: string;
  name: string;
  zones: Map<string, PlanZone>;
}
interface Plan {
  providers: Map<string, PlanProvider>;
  unmatched: string[];
  warnings: string[];
}

/**
 * The chosen tables merged into one write plan. Tables for the same provider + zone + shipment
 * type (DHL's 0.5–30 kg grid and its 30.1–70 kg per-kg table) become one rate card, with the hair
 * gap between them (30.01–30.09 kg) closed so no weight goes unpriced.
 */
export function buildPlan(
  tables: DetectedTable[],
  matcher: CountryMatcher,
): Plan {
  const plan: Plan = { providers: new Map(), unmatched: [], warnings: [] };

  for (const table of tables) {
    for (const detected of table.providers) {
      if (!plan.providers.has(detected.code)) {
        plan.providers.set(detected.code, {
          code: detected.code,
          name: detected.name,
          zones: new Map(),
        });
      }
      const provider = plan.providers.get(detected.code)!;
      for (const zone of detected.zones) {
        const key = zone.name.toLowerCase();
        if (!provider.zones.has(key)) {
          provider.zones.set(key, {
            name: zone.name,
            cards: new Map(),
            countries: new Map(),
          });
        }
        const target = provider.zones.get(key)!;
        target.cards.set(zone.shipmentType, [
          ...(target.cards.get(zone.shipmentType) ?? []),
          ...zone.bands,
        ]);
      }
    }
    linkCountries(table, plan, matcher);
  }

  for (const provider of plan.providers.values()) {
    for (const zone of provider.zones.values()) {
      for (const [type, bands] of zone.cards)
        zone.cards.set(
          type,
          joinBands(bands, `${provider.name} ${zone.name}`, plan),
        );
    }
  }
  plan.unmatched = [...new Set(plan.unmatched)];
  return plan;
}

function joinBands(bands: RateBand[], label: string, plan: Plan): RateBand[] {
  const sorted = [...bands].sort((a, b) => a.weightFromKg - b.weightFromKg);
  const out: RateBand[] = [];
  let overlapping = 0;
  for (const band of sorted) {
    const prev = out[out.length - 1];
    if (prev && band.weightFromKg <= prev.weightToKg) {
      overlapping += 1;
      continue;
    }
    if (prev && band.weightFromKg - prev.weightToKg <= 0.11) {
      out.push({ ...band, weightFromKg: round2(prev.weightToKg + 0.01) });
    } else {
      out.push(band);
    }
  }
  if (overlapping > 0) {
    // Almost always the same destination listed twice in the sheet (Maldives under ASIA and ROW).
    plan.warnings.push(
      `${label} is priced twice in the chosen tables; ${overlapping} overlapping band${overlapping === 1 ? '' : 's'} from the later one were skipped.`,
    );
  }
  return out;
}

function linkCountries(
  table: DetectedTable,
  plan: Plan,
  matcher: CountryMatcher,
) {
  // A country belongs to one zone per provider (ZoneCountry is unique on that pair).
  const assign = (
    providerCode: string,
    zone: DetectedZone,
    country: Country,
    override: boolean,
  ) => {
    const provider = plan.providers.get(providerCode)!;
    const target = provider.zones.get(zone.name.toLowerCase())!;
    for (const other of provider.zones.values()) {
      if (other === target || !other.countries.has(country.id)) continue;
      if (!override) {
        plan.warnings.push(
          `${country.name} is listed under ${other.name} and ${target.name} for ${provider.name}; kept ${other.name}.`,
        );
        return;
      }
      other.countries.delete(country.id);
    }
    target.countries.set(country.id, country);
  };

  for (const detected of table.providers) {
    if (table.kind === 'zone-grid') {
      const byName = new Map(
        detected.zones.map((z) => [z.name.toLowerCase(), z]),
      );
      const missingZones = new Set<string>();
      for (const entry of table.countryMap) {
        const country = matcher.entry(entry.country, entry.code);
        if (!country) {
          plan.unmatched.push(entry.country);
          continue;
        }
        const zone = byName.get(entry.zone.toLowerCase());
        if (!zone) {
          missingZones.add(entry.zone);
          continue;
        }
        assign(detected.code, zone, country, false);
      }
      if (missingZones.size > 0) {
        plan.warnings.push(
          `${detected.name}: the zone list mentions ${[...missingZones].join(', ')}, which have no rates in this table. Those countries were not linked.`,
        );
      }
      // A column named for countries ("AU", "PL , CZ , RO") is their own rate and wins over the list.
      for (const zone of detected.zones) {
        for (const code of zone.countryCodes) {
          const country = matcher.code(code);
          if (country) assign(detected.code, zone, country, true);
        }
      }
    } else {
      for (const zone of detected.zones) {
        const countries = listZoneCountries(zone, matcher);
        if (countries.length === 0)
          plan.unmatched.push(
            `${zone.destination} (${zone.countryCodes.join(', ') || 'no code'})`,
          );
        for (const country of countries)
          assign(detected.code, zone, country, false);
      }
    }
  }
}

const GENERIC_WORDS = new Set([
  'south',
  'north',
  'republic',
  'islands',
  'island',
  'and',
  'the',
  'united',
  'states',
]);

/**
 * Which countries a country-list row is for. The name wins when it starts the destination
 * ("Cambodia" coded CD, which is Congo); a code alone is trusted only when the name agrees, so
 * "Scotland" coded ST never becomes São Tomé and "Northern Ireland" never becomes Ireland.
 */
function listZoneCountries(
  zone: DetectedZone,
  matcher: CountryMatcher,
): Country[] {
  const destination = zone.destination ?? '';
  const coded = zone.countryCodes
    .map((c) => matcher.code(c))
    .filter((c): c is Country => c !== null);
  if (zone.countryCodes.length >= 2) {
    // "BN, ID, KR | Brunei, Indonesia, Korea …": keep the codes whose country the text names.
    const text = ` ${normalizeCountry(destination)} `;
    return coded.filter((c) =>
      normalizeCountry(c.name)
        .split(' ')
        .some(
          (word) =>
            word.length >= 4 &&
            !GENERIC_WORDS.has(word) &&
            text.includes(` ${word}`),
        ),
    );
  }
  const named = matcher.atStart(destination);
  if (named) return [named];
  if (coded.length === 1 && matcher.anywhere(destination)?.id === coded[0].id)
    return coded;
  return [];
}

// Names carriers use that differ from the app's country list (CLDR short names).
const ALIASES: Record<string, string> = {
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
  usa: 'US',
  'u s a': 'US',
  'united states of america': 'US',
  uae: 'AE',
  hongkong: 'HK',
  'hong kong': 'HK',
  macau: 'MO',
  macao: 'MO',
  korea: 'KR',
  'korea republic of': 'KR',
  'republic of korea': 'KR',
  'czech republic': 'CZ',
  turkey: 'TR',
  'ivory coast': 'CI',
  'cote d ivoire': 'CI',
  swaziland: 'SZ',
  macedonia: 'MK',
  'viet nam': 'VN',
  'russian federation': 'RU',
  'brunei darussalam': 'BN',
  bosnia: 'BA',
  bahama: 'BS',
  holland: 'NL',
  'congo democratic republic': 'CD',
  'democratic republic of congo': 'CD',
  'congo brazzaville': 'CG',
  'republic of congo': 'CG',
  'syrian arab republic': 'SY',
  'iran islamic republic of': 'IR',
  lao: 'LA',
  'tanzania united republic of': 'TZ',
  'united republic of tanzania': 'TZ',
  phillipines: 'PH',
  'east timor': 'TL',
  'republic of moldova': 'MD',
  'faeroe islands': 'FO',
  'palestinian territory': 'PS',
  'democratic republic of the congo': 'CD',
  kirghizia: 'KG',
  'libyan arab jamahiriya': 'LY',
  monserrat: 'MS',
  'wallis and futuna islands': 'WF',
  'st vincent and the grenadines': 'VC',
  'st christopher': 'KN',
  'st martin': 'MF',
  'st maarten': 'SX',
  'bonaire st eustatius saba': 'BQ',
  'bonaire sint eustatius and saba': 'BQ',
};

export function normalizeCountry(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/[’'`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class CountryMatcher {
  private readonly byCode = new Map<string, Country>();
  private readonly names: { norm: string; country: Country }[] = [];

  constructor(countries: Country[]) {
    for (const country of countries) {
      this.byCode.set(country.code.toUpperCase(), country);
      this.names.push({ norm: normalizeCountry(country.name), country });
    }
    for (const [alias, code] of Object.entries(ALIASES)) {
      const country = this.byCode.get(code);
      if (country) this.names.push({ norm: normalizeCountry(alias), country });
    }
    // Longest first, so "guinea bissau" is tried before "guinea".
    this.names.sort((a, b) => b.norm.length - a.norm.length);
  }

  code(code: string): Country | null {
    return this.byCode.get(code.trim().toUpperCase()) ?? null;
  }

  /** A country named at the very start: "Kenya (Duty Extra …)", "UK ECONOMY", "USA". */
  atStart(text: string): Country | null {
    const t = normalizeCountry(text);
    return (
      this.names.find((n) => t === n.norm || t.startsWith(`${n.norm} `))
        ?.country ?? null
    );
  }

  /** A country named anywhere, as whole words: "Lusaka/Zambia". */
  anywhere(text: string): Country | null {
    const t = ` ${normalizeCountry(text)} `;
    return this.names.find((n) => t.includes(` ${n.norm} `))?.country ?? null;
  }

  /** An entry of a carrier's zone list: "Afghanistan (AF)", "Aland Island (Finland)", "Bahama". */
  entry(name: string, code: string | null): Country | null {
    if (code) {
      const byCode = this.code(code);
      if (byCode) return byCode;
    }
    const t = normalizeCountry(name);
    const exact = this.names.find((n) => n.norm === t);
    if (exact) return exact.country;
    const start = this.atStart(name);
    if (start) return start;
    // Cut short or singular: "aland island" for "aland islands". Only when it points at one country.
    const head = normalizeCountry(name.split(/[(,]/)[0]);
    if (head.length < 4) return null;
    const hits = this.names.filter((n) => n.norm.startsWith(head));
    return new Set(hits.map((h) => h.country.id)).size === 1
      ? hits[0].country
      : null;
  }
}
