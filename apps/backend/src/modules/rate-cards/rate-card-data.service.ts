import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ShipmentTypeCode } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { CompanySettingsService } from './company-settings.service';
import { toCompanySettingsDto } from './company-settings.mapper';
import {
  PricingEngineService,
  type ComputedRateOption,
} from '../pricing/pricing-engine.service';

// The known open-ended top bracket used by the real FedEx/DHL/UPS data import — a row that hits
// this exact weight is relabeled "X KG & Above" and priced per kg instead of a flat total, since
// a single flat price stops making sense for an unbounded weight range.
const OPEN_ENDED_WEIGHT_SENTINEL_KG = 999.99;

export interface BuildRateCardCountryInput {
  countryId: string;
  transitTime?: string;
}

export interface BuildRateCardDataInput {
  rateProviderId: string;
  shipmentType: ShipmentTypeCode;
  countries: BuildRateCardCountryInput[];
  effectiveDate: string;
}

export interface RateCardWeightRow {
  label: string;
  weightKg: number;
  // "X KG & Above" rows show a per-kg rate (finalPrice / weightKg) instead of a flat total —
  // matches how real carrier rate cards price open-ended heavy brackets.
  isPerKg: boolean;
}

export interface RateCardCountryColumn {
  id: string;
  code: string;
  name: string;
  transitTime: string | null;
}

export interface RateCardData {
  // Internal only — used by RateCardDocumentsService to persist the FK and by the admin history
  // list, but the template must never render it (the provider is deliberately never named on the
  // customer-facing document).
  rateProviderId: string;
  shipmentType: ShipmentTypeCode;
  effectiveDate: string;
  countries: RateCardCountryColumn[];
  weightRows: RateCardWeightRow[];
  // prices[countryIndex][rowIndex] — aligned to `countries`/`weightRows` above, deliberately not
  // keyed by a floating-point weight to avoid stringly-keyed float lookups.
  prices: (number | null)[][];
  companySettings: ReturnType<typeof toCompanySettingsDto>;
  // Raw storage-relative path (e.g. "logos/<uuid>.png"), separate from companySettings.logoUrl —
  // the PDF renderer needs a real file it can read off disk into a Buffer (see
  // RateCardPdfService), not a URL. Never exposed outside the backend.
  logoPath: string | null;
}

interface ResolvedCountry {
  id: string;
  code: string;
  name: string;
  transitTime: string | null;
  zoneId: string;
}

// The single bridge between the pricing engine and PDF presentation — never reimplements or
// exposes the 7-step calculation's internal fields (baseRate/pssAmount/fuelChargePercent/
// gstPercent/nationwideCut). Every price in the returned data is a bare `finalPrice` straight
// from PricingEngineService, the same authoritative calculation real customer quotes use.
@Injectable()
export class RateCardDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  // Every country mapped to any zone under this provider — feeds the admin's country multi-select,
  // which never surfaces zones directly (see the module-level plan for why).
  async listCountriesForProvider(
    rateProviderId: string,
  ): Promise<{ id: string; code: string; name: string }[]> {
    const memberships = await this.prisma.zoneCountry.findMany({
      where: { rateProviderId },
      include: { country: true },
    });
    return memberships
      .map((m) => ({
        id: m.country.id,
        code: m.country.code,
        name: m.country.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async build(input: BuildRateCardDataInput): Promise<RateCardData> {
    const provider = await this.prisma.rateProvider.findUnique({
      where: { id: input.rateProviderId },
    });
    if (!provider) {
      throw new NotFoundException(
        `Rate provider ${input.rateProviderId} not found`,
      );
    }
    if (input.countries.length === 0) {
      throw new BadRequestException('Select at least one country');
    }

    const resolvedCountries = await this.resolveCountries(input);

    // Countries are picked individually and can land in different zones under the same
    // provider — group by zone so each distinct rate card is only fetched/priced once, not once
    // per country (the old zone-only flow could assume a single shared zone; this one can't).
    const zoneIds = Array.from(new Set(resolvedCountries.map((c) => c.zoneId)));
    const pricingByZone = new Map<
      string,
      {
        weightRows: RateCardWeightRow[];
        priceByWeightKg: Map<number, number | null>;
      }
    >();

    for (const zoneId of zoneIds) {
      const rateCard = await this.prisma.rateCard.findFirst({
        where: { zoneId, shipmentType: input.shipmentType },
        include: { weightSlabs: { where: { isActive: true } } },
      });
      const weightRows = this.buildWeightRows(rateCard?.weightSlabs ?? []);
      const representativeCountry = resolvedCountries.find(
        (c) => c.zoneId === zoneId,
      )!;

      const priceByWeightKg = new Map<number, number | null>();
      for (const row of weightRows) {
        const options = await this.pricingEngine.computeQuotesForRequest({
          destinationCountryName: representativeCountry.name,
          weightKg: row.weightKg,
          shipmentType: input.shipmentType,
        });
        const option = options.find(
          (o: ComputedRateOption) => o.rateProviderId === provider.id,
        );
        priceByWeightKg.set(row.weightKg, option ? option.finalPrice : null);
      }
      pricingByZone.set(zoneId, { weightRows, priceByWeightKg });
    }

    // Union of every distinct weight row across all involved zones, sorted ascending — a country
    // whose own zone has no matching bracket for a given row simply gets a null cell for it
    // (a real gap, never fabricated), same convention as the rest of this module.
    const weightRows = this.mergeWeightRows(
      zoneIds.map((zoneId) => pricingByZone.get(zoneId)!.weightRows),
    );

    const prices: (number | null)[][] = resolvedCountries.map((country) => {
      const zonePricing = pricingByZone.get(country.zoneId)!;
      return weightRows.map(
        (row) => zonePricing.priceByWeightKg.get(row.weightKg) ?? null,
      );
    });

    const rawSettings = await this.companySettingsService.get();
    const companySettings = toCompanySettingsDto(rawSettings);

    return {
      rateProviderId: provider.id,
      shipmentType: input.shipmentType,
      effectiveDate: input.effectiveDate,
      countries: resolvedCountries.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        transitTime: c.transitTime,
      })),
      weightRows,
      prices,
      companySettings,
      logoPath: rawSettings.logoPath,
    };
  }

  private async resolveCountries(
    input: BuildRateCardDataInput,
  ): Promise<ResolvedCountry[]> {
    const resolved: ResolvedCountry[] = [];
    for (const selection of input.countries) {
      const membership = await this.prisma.zoneCountry.findUnique({
        where: {
          rateProviderId_countryId: {
            rateProviderId: input.rateProviderId,
            countryId: selection.countryId,
          },
        },
        include: { zone: true, country: true },
      });
      if (!membership) {
        throw new BadRequestException(
          `${selection.countryId} has no zone assignment under this provider — it can't be priced`,
        );
      }
      resolved.push({
        id: membership.country.id,
        code: membership.country.code,
        name: membership.country.name,
        transitTime: selection.transitTime ?? null,
        zoneId: membership.zone.id,
      });
    }
    return resolved;
  }

  private buildWeightRows(
    slabs: {
      weightFromKg: { toNumber(): number };
      weightToKg: { toNumber(): number };
    }[],
  ): RateCardWeightRow[] {
    const sorted = [...slabs].sort(
      (a, b) => a.weightFromKg.toNumber() - b.weightFromKg.toNumber(),
    );

    return sorted.map((slab) => {
      const fromKg = slab.weightFromKg.toNumber();
      const toKg = slab.weightToKg.toNumber();
      const isPerKg = toKg === OPEN_ENDED_WEIGHT_SENTINEL_KG;
      // For an open-ended bracket, pricing "at 999.99kg" would be meaningless (and huge, since
      // PSS scales with weight) — query the pricing engine at the bracket's real lower bound
      // instead (e.g. 10kg for "10kg & Above"), a genuine shipment weight, then the template
      // divides that real finalPrice by this same weight to show an effective per-kg rate.
      return {
        weightKg: isPerKg ? fromKg : toKg,
        label: isPerKg ? `${fromKg} KG & Above` : `${toKg} KG`,
        isPerKg,
      };
    });
  }

  private mergeWeightRows(rowSets: RateCardWeightRow[][]): RateCardWeightRow[] {
    const byWeightKg = new Map<number, RateCardWeightRow>();
    for (const rows of rowSets) {
      for (const row of rows) {
        if (!byWeightKg.has(row.weightKg)) {
          byWeightKg.set(row.weightKg, row);
        }
      }
    }
    return Array.from(byWeightKg.values()).sort(
      (a, b) => a.weightKg - b.weightKg,
    );
  }
}
