import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type {
  FuelAutoApplyResultDto,
  FuelSurchargeCheckDto,
  FuelSurchargeRefreshDto,
  FuelSurchargeUpdateDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import {
  FUEL_SURCHARGE_SOURCES,
  parseDhlFuelSurcharge,
} from './fuel-surcharge-sources';

// Only the last five updates per carrier are kept. A surcharge changes weekly; what anyone ever
// asks is "what did we change it to, and when" for the recent past, and an unbounded audit of a
// number that moves every Monday is a table nobody reads.
const HISTORY_KEPT = 5;
const FETCH_TIMEOUT_MS = 12_000;
// The daily check applies a published figure on its own only when it moves less than this from
// what is configured. DHL's weekly change is a point or two; a bigger jump means the page changed
// shape or a row was misread, and a person should look before every quote moves.
const MAX_AUTO_CHANGE_POINTS = 10;
// Opening Fuel & PSS refreshes from the carrier's page; admins reopening it within this window are
// served the page already read rather than hitting DHL again.
const PAGE_CACHE_MS = 10 * 60_000;

type PageRead = { html: string; error: null } | { html: null; error: string };

/**
 * Keeping the fuel surcharge in step with what the carriers publish.
 *
 * For carriers whose page the server can read (DHL), autoApply() applies the current week's
 * figure: each morning (FuelSurchargeScheduler) and whenever an admin opens Fuel & PSS (refresh()).
 * It applies only a plausible weekly move (MAX_AUTO_CHANGE_POINTS); anything bigger is held for an
 * admin, because fuel feeds every quote and a misread page must not reprice the whole book.
 * FedEx and UPS refuse the server, so their figures are only ever applied by an admin.
 */
@Injectable()
export class FuelSurchargeService {
  private readonly logger = new Logger(FuelSurchargeService.name);
  private readonly pageCache = new Map<
    string,
    { at: number; read: Promise<PageRead> }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** What each carrier is configured at, what its site says, and the last five changes. */
  async check(): Promise<FuelSurchargeCheckDto[]> {
    const providers = await this.prisma.rateProvider.findMany({
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      providers.map(async (provider) => {
        const source = FUEL_SURCHARGE_SOURCES.find(
          (s) => s.providerCode === provider.code,
        );
        const history = await this.history(provider.id);

        if (!source) {
          return {
            rateProviderId: provider.id,
            code: provider.code,
            name: provider.name,
            configuredPercent: provider.fuelChargePercent,
            fetchedPercent: null,
            fetchedLabel: null,
            sourceUrl: null,
            automatic: false,
            note: 'No published source is configured for this carrier — enter the percentage by hand.',
            error: null,
            history,
          };
        }

        const base = {
          rateProviderId: provider.id,
          code: provider.code,
          name: provider.name,
          configuredPercent: provider.fuelChargePercent,
          sourceUrl: source.url,
          automatic: source.automatic,
          note: source.note,
          history,
        };

        if (!source.automatic) {
          return {
            ...base,
            fetchedPercent: null,
            fetchedLabel: null,
            error: null,
          };
        }

        const fetched = await this.fetchDhl(source.url);
        return {
          ...base,
          fetchedPercent: fetched.parsed?.percent ?? null,
          fetchedLabel: fetched.parsed?.label ?? null,
          error: fetched.error,
        };
      }),
    );
  }

  /**
   * Writes the percentage onto the provider, records who did it, and prunes the history back to
   * the last five. Applying is the only thing that changes a price.
   */
  async apply(
    rateProviderId: string,
    percent: number,
    /** Null when the daily check applies it: nobody signed in. */
    actorId: string | null,
    source: 'CARRIER_SITE' | 'MANUAL',
    label?: string,
  ): Promise<FuelSurchargeUpdateDto[]> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException(
        'A fuel surcharge is a percentage between 0 and 100',
      );
    }
    const provider = await this.prisma.rateProvider.findUnique({
      where: { id: rateProviderId },
    });
    if (!provider) {
      throw new NotFoundException(`Rate provider ${rateProviderId} not found`);
    }

    const previous = provider.fuelChargePercent;
    await this.prisma.rateProvider.update({
      where: { id: rateProviderId },
      data: { fuelChargePercent: percent },
    });
    await this.prisma.fuelSurchargeUpdate.create({
      data: {
        rateProviderId,
        percent,
        previousPercent: previous,
        source,
        label: label ?? null,
        appliedByAdminId: actorId,
      },
    });
    // The audit log needs a person; an automatic change is recorded by the history row above
    // (appliedBy empty), which the Fuel & PSS screen shows as "applied automatically".
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'FUEL_SURCHARGE_UPDATED',
          entity: 'RateProvider',
          entityId: rateProviderId,
          before: { fuelChargePercent: previous },
          after: { fuelChargePercent: percent, source, label: label ?? null },
        },
      });
    }

    await this.prune(rateProviderId);
    return this.history(rateProviderId);
  }

  /**
   * Opening Fuel & PSS: apply what the readable carrier pages say now, then report where every
   * carrier stands. The admin who opened it is recorded against any change.
   */
  async refresh(actorId: string): Promise<FuelSurchargeRefreshDto> {
    const results = await this.autoApply(new Date(), actorId);
    return { results, rows: await this.check() };
  }

  /**
   * Reads every carrier page the server can read and applies this week's figure where it differs.
   * Run each morning by FuelSurchargeScheduler (actorId null) and on opening Fuel & PSS; safe to
   * run again (an unchanged figure is skipped).
   */
  async autoApply(
    now: Date = new Date(),
    actorId: string | null = null,
  ): Promise<FuelAutoApplyResultDto[]> {
    const providers = await this.prisma.rateProvider.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const results: FuelAutoApplyResultDto[] = [];

    for (const provider of providers) {
      const source = FUEL_SURCHARGE_SOURCES.find(
        (s) => s.providerCode === provider.code && s.automatic,
      );
      if (!source) continue;
      // DHL and DHL Express read the same page; the page cache fetches it once.
      const fetched = await this.fetchDhl(source.url, now);
      const parsed = fetched.parsed;
      const current = provider.fuelChargePercent;

      if (!parsed) {
        results.push({
          code: provider.code,
          outcome: 'FAILED',
          percent: null,
          previousPercent: null,
          label: null,
          detail: fetched.error ?? 'Nothing could be read from the page.',
        });
      } else if (parsed.percent === current) {
        results.push({
          code: provider.code,
          outcome: 'UNCHANGED',
          percent: current,
          previousPercent: null,
          label: parsed.label,
          detail: `${parsed.label} is ${parsed.percent}%, as configured.`,
        });
      } else if (
        current > 0 &&
        Math.abs(parsed.percent - current) > MAX_AUTO_CHANGE_POINTS
      ) {
        results.push({
          code: provider.code,
          outcome: 'HELD',
          percent: parsed.percent,
          previousPercent: current,
          label: parsed.label,
          detail: `${parsed.label} reads ${parsed.percent}% against ${current}% configured: too large a move to apply unseen. Check it on Fuel & PSS.`,
        });
      } else {
        await this.apply(
          provider.id,
          parsed.percent,
          actorId,
          'CARRIER_SITE',
          parsed.label,
        );
        results.push({
          code: provider.code,
          outcome: 'APPLIED',
          percent: parsed.percent,
          previousPercent: current,
          label: parsed.label,
          detail: `${current}% → ${parsed.percent}% (${parsed.label}).`,
        });
      }
    }

    for (const r of results) {
      const line = `Fuel surcharge ${r.code}: ${r.outcome}. ${r.detail}`;
      if (r.outcome === 'HELD' || r.outcome === 'FAILED')
        this.logger.warn(line);
      else this.logger.log(line);
    }
    return results;
  }

  /** The last five changes, newest first. */
  async history(rateProviderId: string): Promise<FuelSurchargeUpdateDto[]> {
    const rows = await this.prisma.fuelSurchargeUpdate.findMany({
      where: { rateProviderId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_KEPT,
      include: { appliedBy: { select: { email: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      percent: row.percent,
      previousPercent: row.previousPercent,
      source: row.source as 'CARRIER_SITE' | 'MANUAL',
      label: row.label,
      appliedByEmail: row.appliedBy?.email ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // Anything past the fifth entry is deleted, so the table stays the size of what is read.
  private async prune(rateProviderId: string): Promise<void> {
    const keep = await this.prisma.fuelSurchargeUpdate.findMany({
      where: { rateProviderId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_KEPT,
      select: { id: true },
    });
    await this.prisma.fuelSurchargeUpdate.deleteMany({
      where: {
        rateProviderId,
        id: { notIn: keep.map((row) => row.id) },
      },
    });
  }

  private async fetchDhl(url: string, now: Date = new Date()) {
    const page = await this.readPage(url);
    if (page.html === null) return { parsed: null, error: page.error };
    const parsed = parseDhlFuelSurcharge(page.html, now);
    return {
      parsed,
      error: parsed
        ? null
        : 'The page loaded but no surcharge could be read from it — it has probably changed shape. Enter the percentage by hand.',
    };
  }

  // One read per page per PAGE_CACHE_MS, shared by everyone asking in that window. A failed read
  // is not kept, so the next open tries the carrier again.
  private readPage(url: string): Promise<PageRead> {
    const cached = this.pageCache.get(url);
    if (cached && Date.now() - cached.at < PAGE_CACHE_MS) return cached.read;
    const read = this.download(url);
    this.pageCache.set(url, { at: Date.now(), read });
    void read.then((r) => {
      if (r.html === null) this.pageCache.delete(url);
    });
    return read;
  }

  private async download(url: string): Promise<PageRead> {
    try {
      const response = await fetch(url, {
        // Carrier sites answer a bare fetch with a challenge page; a browser UA is the difference
        // between the table and 244 bytes of nothing.
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { html: null, error: `The page answered ${response.status}.` };
      }
      return { html: await response.text(), error: null };
    } catch (error) {
      // A carrier being unreachable is ordinary; it must not take the screen down with it.
      this.logger.warn(
        `Fuel surcharge fetch failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        html: null,
        error: 'Could not reach the carrier site just now.',
      };
    }
  }
}
