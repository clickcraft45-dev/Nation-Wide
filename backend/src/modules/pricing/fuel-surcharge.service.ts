import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type {
  FuelSurchargeCheckDto,
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

/**
 * Keeping the fuel surcharge in step with what the carriers publish.
 *
 * Reading a page NEVER changes a price. The fetched figure is shown next to the configured one and
 * an admin applies it — fuel feeds every quote this app produces, and a scraper that writes
 * straight into pricing would reprice the whole book the first time a page changed shape.
 */
@Injectable()
export class FuelSurchargeService {
  private readonly logger = new Logger(FuelSurchargeService.name);

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
    actorId: string,
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

    await this.prune(rateProviderId);
    return this.history(rateProviderId);
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

  private async fetchDhl(url: string) {
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
        return { parsed: null, error: `The page answered ${response.status}.` };
      }
      const parsed = parseDhlFuelSurcharge(await response.text());
      return {
        parsed,
        error: parsed
          ? null
          : 'The page loaded but no surcharge could be read from it — it has probably changed shape. Enter the percentage by hand.',
      };
    } catch (error) {
      // A carrier being unreachable is ordinary; it must not take the screen down with it.
      this.logger.warn(
        `Fuel surcharge fetch failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        parsed: null,
        error: 'Could not reach the carrier site just now.',
      };
    }
  }
}
