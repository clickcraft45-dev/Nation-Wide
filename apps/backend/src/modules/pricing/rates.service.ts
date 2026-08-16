import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ShipmentTypeCode } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { CreateRateDto } from './dto/create-rate.dto';
import { UpdateRateDto } from './dto/update-rate.dto';
import { QueryRatesDto } from './dto/query-rates.dto';
import { BulkUpdateRatesDto } from './dto/bulk-update-rates.dto';
import { findOverlappingSlabs } from './weight-slab-overlap';

const withDetails = {
  include: {
    rateCard: { include: { zone: { include: { rateProvider: true } } } },
    createdBy: { select: { email: true } },
    updatedBy: { select: { email: true } },
  },
};
export type RateWithDetails = Prisma.WeightSlabGetPayload<typeof withDetails>;

type DecimalRateFields = {
  weightFromKg: Prisma.Decimal;
  weightToKg: Prisma.Decimal;
  baseRate: Prisma.Decimal;
  gstPercent: Prisma.Decimal;
  nationwideCut: Prisma.Decimal;
};

const MAX_GST_PERCENT = 100;

// This is "RatesService" from the admin's point of view — a Rate is a WeightSlab row. RateCard
// is a thin, invisible (zone, shipmentType) grouping key the admin never interacts with
// directly; see the schema doc comments on both models for the full rationale.
@Injectable()
export class RatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryRatesDto): Promise<RateWithDetails[]> {
    const zoneWhere: Prisma.ZoneWhereInput = {};
    if (query.rateProviderId) zoneWhere.rateProviderId = query.rateProviderId;
    if (query.search) {
      zoneWhere.OR = [
        {
          rateProvider: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const rateCardWhere: Prisma.RateCardWhereInput = {};
    if (query.zoneId) rateCardWhere.zoneId = query.zoneId;
    if (query.shipmentType) rateCardWhere.shipmentType = query.shipmentType;
    if (Object.keys(zoneWhere).length > 0) rateCardWhere.zone = zoneWhere;

    const where: Prisma.WeightSlabWhereInput = {};
    if (Object.keys(rateCardWhere).length > 0) where.rateCard = rateCardWhere;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.weightKg !== undefined) {
      where.weightFromKg = { lte: query.weightKg };
      where.weightToKg = { gte: query.weightKg };
    }

    return this.prisma.weightSlab.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...withDetails,
    });
  }

  findOne(id: string): Promise<RateWithDetails> {
    return this.findOneOrThrow(id);
  }

  async create(dto: CreateRateDto, actorId: string): Promise<RateWithDetails> {
    if (dto.weightToKg < dto.weightFromKg) {
      throw new BadRequestException('weightToKg must be >= weightFromKg');
    }
    if ((dto.gstPercent ?? 0) > MAX_GST_PERCENT) {
      throw new BadRequestException('gstPercent cannot exceed 100');
    }

    // Find-or-create, atomically — a plain findFirst-then-create would race two concurrent
    // first-ever submissions for the same (zone, shipmentType) pair.
    const rateCard = await this.prisma.rateCard.upsert({
      where: {
        zoneId_shipmentType: {
          zoneId: dto.zoneId,
          shipmentType: dto.shipmentType,
        },
      },
      update: {},
      create: {
        zoneId: dto.zoneId,
        shipmentType: dto.shipmentType,
        createdByAdminId: actorId,
      },
    });

    const activeSiblings = await this.prisma.weightSlab.findMany({
      where: { rateCardId: rateCard.id, isActive: true },
    });

    // Exact-match on an already-active rate is a duplicate, not an overlap — the spec wants a
    // friendly "update it instead?" prompt here, not a hard rejection.
    const exactDuplicate = activeSiblings.find(
      (s) =>
        s.weightFromKg.toNumber() === dto.weightFromKg &&
        s.weightToKg.toNumber() === dto.weightToKg,
    );
    if (exactDuplicate) {
      const zone = await this.prisma.zone.findUniqueOrThrow({
        where: { id: dto.zoneId },
        include: { rateProvider: true },
      });
      throw new ConflictException({
        message: 'duplicate_rate',
        existingRateId: exactDuplicate.id,
        rateProviderName: zone.rateProvider.name,
        zoneName: zone.name,
        shipmentType: dto.shipmentType,
        weightFromKg: dto.weightFromKg,
        weightToKg: dto.weightToKg,
      });
    }

    this.assertNoOverlapAmong(activeSiblings, {
      weightFromKg: dto.weightFromKg,
      weightToKg: dto.weightToKg,
    });

    const rate = await this.prisma.weightSlab.create({
      data: {
        rateCardId: rateCard.id,
        weightFromKg: dto.weightFromKg,
        weightToKg: dto.weightToKg,
        baseRate: dto.baseRate,
        gstPercent: dto.gstPercent ?? 0,
        nationwideCut: dto.nationwideCut ?? 0,
        createdByAdminId: actorId,
      },
      ...withDetails,
    });

    await this.writeAuditLog(
      actorId,
      'RATE_CREATED',
      rate.id,
      {},
      this.toAuditSnapshot(rate),
      dto.reason,
    );

    return rate;
  }

  // Country-scoped listing that resolves (provider, country) -> zone internally via
  // ZoneCountry's unique index — the frontend drill-down never needs to know a "zone" exists.
  async findForProviderCountry(
    rateProviderId: string,
    countryId: string,
    shipmentType: ShipmentTypeCode,
  ): Promise<RateWithDetails[]> {
    const zoneCountry = await this.prisma.zoneCountry.findUnique({
      where: { rateProviderId_countryId: { rateProviderId, countryId } },
    });
    if (!zoneCountry) {
      throw new NotFoundException(
        `Country ${countryId} is not configured under provider ${rateProviderId}`,
      );
    }
    return this.prisma.weightSlab.findMany({
      where: { rateCard: { zoneId: zoneCountry.zoneId, shipmentType } },
      orderBy: { weightFromKg: 'asc' },
      ...withDetails,
    });
  }

  // Values-only bulk edit — weight ranges are never touched here (see BulkUpdateRatesDto), so
  // the overlap check that guards create/update/setActive doesn't apply: changing a rate's
  // price can never create a new overlap among siblings whose ranges are unchanged.
  async bulkUpdate(
    dto: BulkUpdateRatesDto,
    actorId: string,
  ): Promise<RateWithDetails[]> {
    if (
      dto.updates.some(
        (u) => u.gstPercent !== undefined && u.gstPercent > MAX_GST_PERCENT,
      )
    ) {
      throw new BadRequestException('gstPercent cannot exceed 100');
    }

    return this.prisma.$transaction(async (tx) => {
      const results: RateWithDetails[] = [];
      for (const row of dto.updates) {
        const existing = await tx.weightSlab.findUnique({
          where: { id: row.id },
          ...withDetails,
        });
        if (!existing) {
          throw new NotFoundException(`Rate ${row.id} not found`);
        }
        const before = this.toAuditSnapshot(existing);
        const updated = await tx.weightSlab.update({
          where: { id: row.id },
          data: {
            baseRate: row.baseRate,
            gstPercent: row.gstPercent,
            nationwideCut: row.nationwideCut,
            updatedByAdminId: actorId,
          },
          ...withDetails,
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'RATE_UPDATED',
            entity: 'WeightSlab',
            entityId: row.id,
            before,
            after: this.toAuditSnapshot(updated),
            reason: dto.reason,
          },
        });
        results.push(updated);
      }
      return results;
    });
  }

  async update(
    id: string,
    dto: UpdateRateDto,
    actorId: string,
  ): Promise<RateWithDetails> {
    const existing = await this.findOneOrThrow(id);

    const nextFrom = dto.weightFromKg ?? existing.weightFromKg.toNumber();
    const nextTo = dto.weightToKg ?? existing.weightToKg.toNumber();
    if (nextTo < nextFrom) {
      throw new BadRequestException('weightToKg must be >= weightFromKg');
    }
    if (dto.gstPercent !== undefined && dto.gstPercent > MAX_GST_PERCENT) {
      throw new BadRequestException('gstPercent cannot exceed 100');
    }

    const siblings = await this.prisma.weightSlab.findMany({
      where: {
        rateCardId: existing.rateCardId,
        isActive: true,
        id: { not: id },
      },
    });
    this.assertNoOverlapAmong(siblings, {
      weightFromKg: nextFrom,
      weightToKg: nextTo,
    });

    const before = this.toAuditSnapshot(existing);

    const updated = await this.prisma.weightSlab.update({
      where: { id },
      data: {
        weightFromKg: dto.weightFromKg,
        weightToKg: dto.weightToKg,
        baseRate: dto.baseRate,
        gstPercent: dto.gstPercent,
        nationwideCut: dto.nationwideCut,
        updatedByAdminId: actorId,
      },
      ...withDetails,
    });

    await this.writeAuditLog(
      actorId,
      'RATE_UPDATED',
      id,
      before,
      this.toAuditSnapshot(updated),
      dto.reason,
    );

    return updated;
  }

  async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    reason?: string,
  ): Promise<RateWithDetails> {
    const existing = await this.findOneOrThrow(id);
    if (existing.isActive === isActive) {
      return existing;
    }

    if (isActive) {
      const siblings = await this.prisma.weightSlab.findMany({
        where: {
          rateCardId: existing.rateCardId,
          isActive: true,
          id: { not: id },
        },
      });
      this.assertNoOverlapAmong(siblings, {
        weightFromKg: existing.weightFromKg.toNumber(),
        weightToKg: existing.weightToKg.toNumber(),
      });
    }

    const updated = await this.prisma.weightSlab.update({
      where: { id },
      data: { isActive, updatedByAdminId: actorId },
      ...withDetails,
    });

    await this.writeAuditLog(
      actorId,
      isActive ? 'RATE_ACTIVATED' : 'RATE_DEACTIVATED',
      id,
      { isActive: existing.isActive },
      { isActive },
      reason,
    );

    return updated;
  }

  private async findOneOrThrow(id: string): Promise<RateWithDetails> {
    const rate = await this.prisma.weightSlab.findUnique({
      where: { id },
      ...withDetails,
    });
    if (!rate) {
      throw new NotFoundException(`Rate ${id} not found`);
    }
    return rate;
  }

  private assertNoOverlapAmong(
    siblings: { weightFromKg: Prisma.Decimal; weightToKg: Prisma.Decimal }[],
    candidate: { weightFromKg: number; weightToKg: number },
  ): void {
    const overlap = findOverlappingSlabs([
      ...siblings.map((s) => ({
        weightFromKg: s.weightFromKg.toNumber(),
        weightToKg: s.weightToKg.toNumber(),
      })),
      candidate,
    ]);
    if (overlap) {
      throw new BadRequestException(
        `Weight range ${candidate.weightFromKg}-${candidate.weightToKg}kg overlaps an ` +
          `existing active rate (${overlap[0].weightFromKg}-${overlap[0].weightToKg}kg vs ` +
          `${overlap[1].weightFromKg}-${overlap[1].weightToKg}kg)`,
      );
    }
  }

  private toAuditSnapshot(rate: DecimalRateFields) {
    return {
      weightFromKg: rate.weightFromKg.toNumber(),
      weightToKg: rate.weightToKg.toNumber(),
      baseRate: rate.baseRate.toNumber(),
      gstPercent: rate.gstPercent.toNumber(),
      nationwideCut: rate.nationwideCut.toNumber(),
    };
  }

  private writeAuditLog(
    actorId: string,
    action: string,
    entityId: string,
    before: Prisma.InputJsonValue,
    after: Prisma.InputJsonValue,
    reason?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity: 'WeightSlab',
        entityId,
        before,
        after,
        reason,
      },
    });
  }
}
