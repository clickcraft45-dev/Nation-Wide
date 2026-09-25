import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ProviderMarginBand, RateProvider } from '@prisma/client';
import {
  SHIPMENT_TYPES,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { CreateRateProviderDto } from './dto/create-rate-provider.dto';
import { UpdateRateProviderDto } from './dto/update-rate-provider.dto';
import { SetMarginBandsDto } from './dto/set-margin-bands.dto';

// OTHER shipments never get a rate (see CreateRateDto) — never offered as a "service" here.
const RATEABLE_SHIPMENT_TYPES = SHIPMENT_TYPES.filter((t) => t !== 'OTHER');

export type RateProviderWithCount = RateProvider & {
  _count: { zoneCountries: number };
  marginBands?: ProviderMarginBand[];
};

export interface ProviderCountry {
  countryId: string;
  countryCode: string;
  countryName: string;
  isActive: boolean;
  zoneId: string;
  zoneName: string;
  availableShipmentTypes: ShipmentTypeCode[];
  weightSlabCount: number;
  lastUpdatedAt: string | null;
}

export interface CountryDetail {
  countryId: string;
  countryCode: string;
  countryName: string;
  isActive: boolean;
  zoneId: string;
  zoneName: string;
  services: {
    shipmentType: ShipmentTypeCode;
    weightSlabCount: number;
    lastUpdatedAt: string | null;
  }[];
  lastUpdatedAt: string | null;
}

@Injectable()
export class RateProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<RateProviderWithCount[]> {
    return this.prisma.rateProvider.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { zoneCountries: { where: { country: { isActive: true } } } },
        },
        marginBands: { orderBy: { fromKg: 'asc' } },
      },
    });
  }

  findOne(id: string): Promise<RateProviderWithCount> {
    return this.findOneOrThrow(id);
  }

  // Every country configured under this provider (via ZoneCountry), each annotated with how
  // much rate configuration exists under its zone — feeds the Providers -> Countries drill-down
  // without the frontend ever needing to know a "zone" exists.
  async getCountriesForProvider(
    rateProviderId: string,
  ): Promise<ProviderCountry[]> {
    await this.findOneOrThrow(rateProviderId);

    const memberships = await this.prisma.zoneCountry.findMany({
      where: { rateProviderId },
      include: { country: true, zone: true },
      orderBy: { country: { name: 'asc' } },
    });
    if (memberships.length === 0) return [];

    const zoneIds = Array.from(new Set(memberships.map((m) => m.zoneId)));
    const rateCards = await this.prisma.rateCard.findMany({
      where: { zoneId: { in: zoneIds } },
      include: { weightSlabs: true },
    });
    const rateCardsByZone = this.groupRateCardsByZone(rateCards, zoneIds);

    return memberships.map((m) => {
      const summary = this.summarizeZoneRateCards(
        rateCardsByZone.get(m.zoneId) ?? [],
      );
      return {
        countryId: m.country.id,
        countryCode: m.country.code,
        countryName: m.country.name,
        isActive: m.country.isActive,
        zoneId: m.zoneId,
        zoneName: m.zone.name,
        availableShipmentTypes: summary.availableShipmentTypes,
        weightSlabCount: summary.weightSlabCount,
        lastUpdatedAt: summary.lastUpdatedAt,
      };
    });
  }

  // Resolves the (provider, country) pair to its zone via ZoneCountry's unique index, then
  // reports per-shipment-type configuration status — this is what the Country Detail page and
  // the shipment-type pill selector above Weight Category Selection read from.
  async getCountryDetail(
    rateProviderId: string,
    countryId: string,
  ): Promise<CountryDetail> {
    const zoneCountry = await this.prisma.zoneCountry.findUnique({
      where: { rateProviderId_countryId: { rateProviderId, countryId } },
      include: { country: true, zone: true },
    });
    if (!zoneCountry) {
      throw new NotFoundException(
        `Country ${countryId} is not configured under provider ${rateProviderId}`,
      );
    }

    const rateCards = await this.prisma.rateCard.findMany({
      where: { zoneId: zoneCountry.zoneId },
      include: { weightSlabs: true },
    });
    const byShipmentType = new Map(
      rateCards.map((rc) => [rc.shipmentType as ShipmentTypeCode, rc]),
    );

    const services = RATEABLE_SHIPMENT_TYPES.map((shipmentType) => {
      const rc = byShipmentType.get(shipmentType);
      const slabs = rc?.weightSlabs ?? [];
      return {
        shipmentType,
        weightSlabCount: slabs.length,
        lastUpdatedAt: this.maxUpdatedAt(slabs),
      };
    });

    return {
      countryId: zoneCountry.country.id,
      countryCode: zoneCountry.country.code,
      countryName: zoneCountry.country.name,
      isActive: zoneCountry.country.isActive,
      zoneId: zoneCountry.zoneId,
      zoneName: zoneCountry.zone.name,
      services,
      lastUpdatedAt: this.maxUpdatedAt(
        rateCards.flatMap((rc) => rc.weightSlabs),
      ),
    };
  }

  async create(dto: CreateRateProviderDto): Promise<RateProvider> {
    const existing = await this.prisma.rateProvider.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(
        `A rate provider with code ${dto.code} already exists`,
      );
    }
    return this.prisma.rateProvider.create({ data: dto });
  }

  // actorId is optional only so existing callers/tests that never touch Fuel Charge/PSS don't
  // need to thread one through — no audit row is written unless one of those two fields is
  // actually part of the update.
  async update(
    id: string,
    dto: UpdateRateProviderDto,
    actorId?: string,
  ): Promise<RateProviderWithCount> {
    const existing = await this.findOneOrThrow(id);
    const { reason, ...fields } = dto;
    const updated = await this.prisma.rateProvider.update({
      where: { id },
      data: fields,
    });

    const configChanged =
      dto.fuelChargePercent !== undefined || dto.pssPerKg !== undefined;
    if (configChanged && actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'PROVIDER_CONFIG_UPDATED',
          entity: 'RateProvider',
          entityId: id,
          before: this.toConfigSnapshot(existing),
          after: this.toConfigSnapshot(updated),
          reason,
        },
      });
    }

    return {
      ...updated,
      _count: existing._count,
      marginBands: existing.marginBands,
    };
  }

  private groupRateCardsByZone<T extends { zoneId: string }>(
    rateCards: T[],
    zoneIds: string[],
  ): Map<string, T[]> {
    const map = new Map<string, T[]>(zoneIds.map((id) => [id, []]));
    for (const rc of rateCards) {
      map.get(rc.zoneId)?.push(rc);
    }
    return map;
  }

  private summarizeZoneRateCards(
    rateCards: { shipmentType: string; weightSlabs: { updatedAt: Date }[] }[],
  ): {
    availableShipmentTypes: ShipmentTypeCode[];
    weightSlabCount: number;
    lastUpdatedAt: string | null;
  } {
    const availableShipmentTypes = rateCards
      .filter((rc) => rc.weightSlabs.length > 0)
      .map((rc) => rc.shipmentType as ShipmentTypeCode);
    const weightSlabCount = rateCards.reduce(
      (sum, rc) => sum + rc.weightSlabs.length,
      0,
    );
    const lastUpdatedAt = this.maxUpdatedAt(
      rateCards.flatMap((rc) => rc.weightSlabs),
    );
    return { availableShipmentTypes, weightSlabCount, lastUpdatedAt };
  }

  private maxUpdatedAt(slabs: { updatedAt: Date }[]): string | null {
    if (slabs.length === 0) return null;
    return new Date(
      Math.max(...slabs.map((s) => s.updatedAt.getTime())),
    ).toISOString();
  }

  /**
   * Replace a provider's whole margin ladder.
   *
   * All-or-nothing rather than per-row CRUD: the bands only make sense as a set (they must not
   * overlap and the ladder should not have holes), and an admin edits the table as a table.
   */
  async setMarginBands(
    rateProviderId: string,
    dto: SetMarginBandsDto,
    actorId?: string,
  ): Promise<RateProviderWithCount> {
    const existing = await this.findOneOrThrow(rateProviderId);

    const bands = [...dto.bands].sort((a, b) => a.fromKg - b.fromKg);
    bands.forEach((band, i) => {
      if (band.toKg != null && band.toKg <= band.fromKg) {
        throw new BadRequestException(
          `A band ending at ${band.toKg} kg cannot start at ${band.fromKg} kg`,
        );
      }
      const next = bands[i + 1];
      if (next && (band.toKg == null || next.fromKg < band.toKg)) {
        throw new BadRequestException(
          `Bands overlap at ${next.fromKg} kg — each band must end where the next begins`,
        );
      }
    });

    await this.prisma.$transaction([
      this.prisma.providerMarginBand.deleteMany({ where: { rateProviderId } }),
      ...bands.map((band) =>
        this.prisma.providerMarginBand.create({
          data: {
            rateProviderId,
            fromKg: band.fromKg,
            toKg: band.toKg ?? null,
            flatAmount: band.flatAmount,
            perKgAmount: band.perKgAmount,
          },
        }),
      ),
    ]);

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'PROVIDER_MARGIN_BANDS_UPDATED',
          entity: 'RateProvider',
          entityId: rateProviderId,
          before: {
            marginBands: this.toBandSnapshot(existing.marginBands ?? []),
          },
          after: { marginBands: this.toBandSnapshot(bands) },
          reason: dto.reason,
        },
      });
    }

    return this.findOneOrThrow(rateProviderId);
  }

  private toBandSnapshot(
    bands: {
      fromKg: number;
      toKg?: number | null;
      flatAmount: number;
      perKgAmount: number;
    }[],
  ): Prisma.InputJsonValue {
    return bands.map((b) => ({
      fromKg: b.fromKg,
      toKg: b.toKg ?? null,
      flatAmount: b.flatAmount,
      perKgAmount: b.perKgAmount,
    }));
  }

  private toConfigSnapshot(provider: RateProvider): Prisma.InputJsonValue {
    return {
      fuelChargePercent: provider.fuelChargePercent,
      pssPerKg: provider.pssPerKg,
    };
  }

  private async findOneOrThrow(id: string): Promise<RateProviderWithCount> {
    const provider = await this.prisma.rateProvider.findUnique({
      where: { id },
      include: {
        _count: {
          select: { zoneCountries: { where: { country: { isActive: true } } } },
        },
        marginBands: { orderBy: { fromKg: 'asc' } },
      },
    });
    if (!provider) {
      throw new NotFoundException(`Rate provider ${id} not found`);
    }
    return provider;
  }
}
