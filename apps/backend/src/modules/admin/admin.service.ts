import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AuditLogEntryDto,
  DashboardSummaryDto,
  IntegrationHealthDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

const HEALTH_WINDOW_SIZE = 100;
const DEFAULT_AUDIT_LOG_LIMIT = 50;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getIntegrationHealth(
    providerCode: string,
  ): Promise<IntegrationHealthDto> {
    const provider = await this.prisma.shippingProvider.findUnique({
      where: { code: providerCode },
    });
    if (!provider) {
      throw new NotFoundException(
        `Unknown shipping provider code: ${providerCode}`,
      );
    }

    const recentLogs = await this.prisma.apiRequestLog.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
      take: HEALTH_WINDOW_SIZE,
    });

    const successCount = recentLogs.filter(
      (log) => log.responseStatus === 200,
    ).length;
    const errorCount = recentLogs.length - successCount;
    const latencies = recentLogs
      .map((log) => log.latencyMs)
      .filter((latency): latency is number => latency !== null);
    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(
            latencies.reduce((sum, latency) => sum + latency, 0) /
              latencies.length,
          )
        : null;
    const lastErrorLog = recentLogs.find((log) => log.responseStatus !== 200);

    return {
      providerCode: provider.code,
      windowSize: recentLogs.length,
      totalCalls: recentLogs.length,
      successCount,
      errorCount,
      errorRatePercent:
        recentLogs.length > 0
          ? Math.round((errorCount / recentLogs.length) * 1000) / 10
          : 0,
      avgLatencyMs,
      lastCallAt: recentLogs[0]?.createdAt.toISOString() ?? null,
      lastError: lastErrorLog
        ? {
            message:
              typeof lastErrorLog.responsePayload === 'object' &&
              lastErrorLog.responsePayload !== null &&
              'error' in lastErrorLog.responsePayload
                ? String(
                    (lastErrorLog.responsePayload as { error: unknown }).error,
                  )
                : 'Unknown error',
            occurredAt: lastErrorLog.createdAt.toISOString(),
          }
        : null,
    };
  }

  async listAuditLogs(filters: {
    entity?: string;
    entityId?: string;
    entities?: string[];
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<AuditLogEntryDto[]> {
    const where: Prisma.AuditLogWhereInput = {
      entity: filters.entity,
      entityId: filters.entityId,
    };
    if (filters.entities?.length) {
      where.entity = { in: filters.entities };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }
    if (filters.search) {
      where.OR = [
        { actor: { email: { contains: filters.search, mode: 'insensitive' } } },
        { action: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? DEFAULT_AUDIT_LOG_LIMIT,
    });

    // WeightSlab audit snapshots only capture rate values (see RatesService.toAuditSnapshot) —
    // resolve Provider/Zone context live for display. Safe: rates are deactivated, never hard-
    // deleted, so the join always resolves for a real historical entry.
    const weightSlabIds = logs
      .filter((log) => log.entity === 'WeightSlab')
      .map((log) => log.entityId);
    const slabs =
      weightSlabIds.length > 0
        ? await this.prisma.weightSlab.findMany({
            where: { id: { in: weightSlabIds } },
            include: {
              rateCard: {
                include: { zone: { include: { rateProvider: true } } },
              },
            },
          })
        : [];
    const slabContextById = new Map(
      slabs.map((slab) => [
        slab.id,
        {
          rateProviderName: slab.rateCard.zone.rateProvider.name,
          zoneName: slab.rateCard.zone.name,
        },
      ]),
    );

    return logs.map((log) => ({
      id: log.id,
      actorEmail: log.actor.email,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      before: log.before,
      after: log.after,
      reason: log.reason,
      rateProviderName:
        slabContextById.get(log.entityId)?.rateProviderName ?? null,
      zoneName: slabContextById.get(log.entityId)?.zoneName ?? null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async getDashboardSummary(): Promise<DashboardSummaryDto> {
    const [
      totalCustomers,
      newQuotes,
      needsManualReview,
      scheduledPickups,
      dropOffs,
      pendingPayments,
    ] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.quote.count({
        where: { status: { in: ['SUBMITTED', 'NEEDS_MANUAL_REVIEW'] } },
      }),
      this.prisma.quote.count({ where: { status: 'NEEDS_MANUAL_REVIEW' } }),
      this.prisma.pickup.count({
        where: {
          method: 'PICKUP',
          status: {
            in: ['SCHEDULED', 'PENDING', 'ASSIGNED', 'PICKUP_IN_PROGRESS'],
          },
        },
      }),
      this.prisma.pickup.count({
        where: { method: 'WAREHOUSE_DROP_OFF', status: 'SCHEDULED' },
      }),
      this.prisma.order.count({ where: { paymentStatus: 'PENDING' } }),
    ]);

    return {
      totalCustomers,
      newQuotes,
      needsManualReview,
      scheduledPickups,
      dropOffs,
      pendingPayments,
    };
  }
}
