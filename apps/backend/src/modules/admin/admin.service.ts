import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuditLogEntryDto,
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
    limit?: number;
  }): Promise<AuditLogEntryDto[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entity: filters.entity,
        entityId: filters.entityId,
      },
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? DEFAULT_AUDIT_LOG_LIMIT,
    });

    return logs.map((log) => ({
      id: log.id,
      actorEmail: log.actor.email,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      before: log.before,
      after: log.after,
      createdAt: log.createdAt.toISOString(),
    }));
  }
}
