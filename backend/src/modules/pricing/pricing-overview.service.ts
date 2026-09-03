import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface PricingDashboardSummary {
  totalProviders: number;
  activeCountries: number;
  totalZones: number;
  totalRateCards: number;
  lastUpdatedAt: string | null;
  pendingChangesCount: number;
  lastGeneratedPdf: { rateProviderName: string; createdAt: string } | null;
}

export interface PricingSearchResult {
  rateProviderId: string;
  rateProviderName: string;
  countryId: string;
  countryName: string;
}

const RATE_CHANGE_ACTIONS = ['RATE_CREATED', 'RATE_UPDATED'];

// Cross-entity aggregation for the Pricing Dashboard and its global search — deliberately kept
// separate from RateProvidersService/RatesService/ZonesService/CountriesService, none of which
// individually own a view that spans all four.
@Injectable()
export class PricingOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary(): Promise<PricingDashboardSummary> {
    const [
      totalProviders,
      activeCountries,
      totalZones,
      totalRateCards,
      latestProvider,
      latestZone,
      latestCountry,
      latestSlab,
      lastDocument,
    ] = await Promise.all([
      this.prisma.rateProvider.count(),
      this.prisma.country.count({ where: { isActive: true } }),
      this.prisma.zone.count(),
      this.prisma.weightSlab.count(),
      this.prisma.rateProvider.findFirst({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.zone.findFirst({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.country.findFirst({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.weightSlab.findFirst({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.rateCardDocument.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { rateProvider: true },
      }),
    ]);

    const candidateDates = [
      latestProvider,
      latestZone,
      latestCountry,
      latestSlab,
    ]
      .map((row) => row?.updatedAt.getTime())
      .filter((time): time is number => time !== undefined);
    const lastUpdatedAt =
      candidateDates.length > 0
        ? new Date(Math.max(...candidateDates)).toISOString()
        : null;

    // Rate edits made after the most recent PDF was generated haven't been reflected in any
    // published rate card yet — that gap is what "Pending Changes" surfaces.
    const pendingChangesCount = await this.prisma.auditLog.count({
      where: {
        entity: 'WeightSlab',
        action: { in: RATE_CHANGE_ACTIONS },
        ...(lastDocument ? { createdAt: { gt: lastDocument.createdAt } } : {}),
      },
    });

    return {
      totalProviders,
      activeCountries,
      totalZones,
      totalRateCards,
      lastUpdatedAt,
      pendingChangesCount,
      lastGeneratedPdf: lastDocument
        ? {
            rateProviderName: lastDocument.rateProvider.name,
            createdAt: lastDocument.createdAt.toISOString(),
          }
        : null,
    };
  }

  // Every (provider, country) pair whose provider or country name/code matches the query —
  // feeds the Pricing Dashboard's global search, deep-linking straight into the country detail
  // page instead of making the admin scroll a table to find it.
  async search(query: string): Promise<PricingSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    const memberships = await this.prisma.zoneCountry.findMany({
      where: {
        OR: [
          { rateProvider: { name: { contains: q, mode: 'insensitive' } } },
          { rateProvider: { code: { contains: q, mode: 'insensitive' } } },
          { country: { name: { contains: q, mode: 'insensitive' } } },
          { country: { code: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { rateProvider: true, country: true },
      orderBy: [
        { rateProvider: { name: 'asc' } },
        { country: { name: 'asc' } },
      ],
      take: 50,
    });

    return memberships.map((m) => ({
      rateProviderId: m.rateProviderId,
      rateProviderName: m.rateProvider.name,
      countryId: m.countryId,
      countryName: m.country.name,
    }));
  }
}
