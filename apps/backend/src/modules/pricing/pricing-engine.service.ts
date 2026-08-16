import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ShipmentTypeCode } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

export interface ComputeQuotesInput {
  destinationCountryName: string;
  weightKg: number;
  shipmentType: ShipmentTypeCode;
}

export interface ComputedRateOption {
  rateProviderId: string;
  rateProviderName: string;
  rateCardId: string;
  weightSlabId: string;
  currency: string;
  baseRate: number;
  pssAmount: number;
  fuelChargePercent: number;
  fuelChargeAmount: number;
  taxableSubtotal: number;
  gstPercent: number;
  gstAmount: number;
  nationwideCut: number;
  finalPrice: number;
}

export interface PriceCalculationInput {
  baseRate: number;
  fuelChargePercent: number;
  pssPerKg: number;
  weightKg: number;
  gstPercent: number;
  nationwideCut: number;
}

export type PriceBreakdown = Omit<
  ComputedRateOption,
  | 'rateProviderId'
  | 'rateProviderName'
  | 'rateCardId'
  | 'weightSlabId'
  | 'currency'
>;

// The single authoritative implementation of the business's mandatory 7-step calculation
// (Section: Complete quotation calculation flow) — reused by both real quote computation
// (computeOption, below) and the admin's no-persistence rate preview (previewRate), so the
// two can never drift apart.
export function calculateFinalPrice(
  input: PriceCalculationInput,
): PriceBreakdown {
  const {
    baseRate,
    fuelChargePercent,
    pssPerKg,
    weightKg,
    gstPercent,
    nationwideCut,
  } = input;
  const pssAmount = round2(pssPerKg * weightKg);

  // Step 3: Fuel Charge applies ONLY to Base Rate — never to PSS/GST/NationWide Cut.
  const fuelChargeAmount = round2(baseRate * (fuelChargePercent / 100));
  // Step 4: Taxable Subtotal.
  const taxableSubtotal = round2(baseRate + pssAmount + fuelChargeAmount);
  // Step 5: GST computed on the taxable subtotal — BEFORE NationWide Cut is added.
  const gstAmount = round2(taxableSubtotal * (gstPercent / 100));
  // Step 6: Subtotal after GST.
  const subtotalAfterGst = round2(taxableSubtotal + gstAmount);
  // Step 7: NationWide Cut added AFTER GST — never itself taxed.
  const finalPrice = round2(subtotalAfterGst + nationwideCut);

  return {
    baseRate,
    pssAmount,
    fuelChargePercent,
    fuelChargeAmount,
    taxableSubtotal,
    gstPercent,
    gstAmount,
    nationwideCut,
    finalPrice,
  };
}

const withActiveWeightSlabs = {
  include: {
    weightSlabs: { where: { isActive: true } },
    zone: { include: { rateProvider: true } },
  },
};
type EligibleRateCard = Prisma.RateCardGetPayload<typeof withActiveWeightSlabs>;
type MatchedWeightSlab = EligibleRateCard['weightSlabs'][number];

// The single authoritative implementation of the business's mandatory 7-step calculation
// (Section: Complete quotation calculation flow) — never duplicate this logic anywhere else,
// including the frontend, which only ever displays what this returns.
@Injectable()
export class PricingEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async computeQuotesForRequest(
    input: ComputeQuotesInput,
  ): Promise<ComputedRateOption[]> {
    // Two-hop resolution: a country's zone is provider-specific (a country can belong to a
    // different zone under each carrier, or to none at all), so we first find every
    // (rateProviderId, zoneId) pair this country belongs to, then look up each provider's
    // RateCard for that exact zone + shipment type. ZoneCountry's unique index guarantees at
    // most one zone per country per provider, so this can never double-count a provider.
    const zoneCountries = await this.prisma.zoneCountry.findMany({
      where: {
        country: {
          isActive: true,
          name: { equals: input.destinationCountryName, mode: 'insensitive' },
        },
        rateProvider: { isActive: true },
      },
    });
    if (zoneCountries.length === 0) return [];

    const rateCards = await this.prisma.rateCard.findMany({
      where: {
        shipmentType: input.shipmentType,
        zoneId: { in: zoneCountries.map((zc) => zc.zoneId) },
        weightSlabs: { some: { isActive: true } },
      },
      ...withActiveWeightSlabs,
    });

    const options: ComputedRateOption[] = [];
    for (const rateCard of rateCards) {
      const slab = this.findMatchingSlab(rateCard.weightSlabs, input.weightKg);
      // No slab covers this weight (a gap, or entirely out of range) — this provider is
      // silently excluded, exactly as if it had no rate card at all (Section: Provider
      // availability). Never fabricate a price.
      if (!slab) continue;
      options.push(this.computeOption(rateCard, slab, input.weightKg));
    }

    return options;
  }

  private findMatchingSlab(
    slabs: MatchedWeightSlab[],
    weightKg: number,
  ): MatchedWeightSlab | undefined {
    return slabs.find(
      (slab) =>
        slab.weightFromKg.toNumber() <= weightKg &&
        weightKg <= slab.weightToKg.toNumber(),
    );
  }

  // No-persistence preview for the admin's Individual Rate Editor — looks up the provider's
  // live Fuel Charge %/PSS the same way computeOption does, then defers to the same pure
  // calculateFinalPrice used for every real quote. Returns a RatePreviewResultDto, not a
  // RateQuoteOptionDto — there's no persisted RateQuoteOption row (no id/createdAt) behind a
  // preview.
  async previewRate(input: {
    rateProviderId: string;
    weightKg: number;
    baseRate: number;
    gstPercent?: number;
    nationwideCut?: number;
  }): Promise<
    { rateProviderId: string; rateProviderName: string } & PriceBreakdown
  > {
    const provider = await this.prisma.rateProvider.findUnique({
      where: { id: input.rateProviderId },
    });
    if (!provider) {
      throw new NotFoundException(
        `Rate provider ${input.rateProviderId} not found`,
      );
    }

    const breakdown = calculateFinalPrice({
      baseRate: input.baseRate,
      fuelChargePercent: provider.fuelChargePercent.toNumber(),
      pssPerKg: provider.pssPerKg.toNumber(),
      weightKg: input.weightKg,
      gstPercent: input.gstPercent ?? 0,
      nationwideCut: input.nationwideCut ?? 0,
    });

    return {
      rateProviderId: provider.id,
      rateProviderName: provider.name,
      ...breakdown,
    };
  }

  private computeOption(
    rateCard: EligibleRateCard,
    slab: MatchedWeightSlab,
    weightKg: number,
  ): ComputedRateOption {
    // Fuel Charge % and PSS/kg are provider-level configuration (RateProvider), not per-slab —
    // constant across every country/weight for this provider until an admin updates the
    // provider's config; see RateProvider's schema doc comment.
    const breakdown = calculateFinalPrice({
      baseRate: slab.baseRate.toNumber(),
      fuelChargePercent:
        rateCard.zone.rateProvider.fuelChargePercent.toNumber(),
      pssPerKg: rateCard.zone.rateProvider.pssPerKg.toNumber(),
      weightKg,
      gstPercent: slab.gstPercent.toNumber(),
      nationwideCut: slab.nationwideCut.toNumber(),
    });

    return {
      rateProviderId: rateCard.zone.rateProviderId,
      rateProviderName: rateCard.zone.rateProvider.name,
      rateCardId: rateCard.id,
      weightSlabId: slab.id,
      currency: rateCard.currency,
      ...breakdown,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
