import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  TrackingResultDto,
  TrackingStatusCode,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { ProviderAdapterRegistry } from '../provider-integration/provider-adapter.registry';
import type { NormalizedTrackingEvent } from '../provider-integration/interfaces/shipping-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { templateForTrackingStatus } from '../notifications/templates';
import { trackingCacheKey } from './tracking-cache-key';

const DEFAULT_PROVIDER_TIMEOUT_MS = 6000;
const DEFAULT_ACTIVE_TTL_SECONDS = 300;
const DEFAULT_TERMINAL_TTL_SECONDS = 86400;
const TERMINAL_STATUSES: TrackingStatusCode[] = ['DELIVERED'];

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly providerRegistry: ProviderAdapterRegistry,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getStatus(internalTrackingNumber: string): Promise<TrackingResultDto> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { internalTrackingNumber },
      include: {
        provider: true,
        externalTrackingNumbers: true,
        order: { select: { customerId: true } },
      },
    });
    if (!shipment) {
      throw new NotFoundException(
        `Tracking number ${internalTrackingNumber} not found`,
      );
    }

    const cacheKey = this.cacheKeyFor(internalTrackingNumber);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TrackingResultDto;
    }

    const externalTrackingNumber = shipment.externalTrackingNumbers[0];
    if (!externalTrackingNumber) {
      // Shipment exists, but no carrier tracking number has been mapped yet (Section 3: staff
      // maps this manually, or a future real adapter's createShipment() call would set it).
      return this.buildDto(internalTrackingNumber, null, null, []);
    }

    const correlationId = randomUUID();
    const startedAt = Date.now();
    try {
      const adapter = this.providerRegistry.resolve(
        shipment.provider.adapterClass,
      );
      const result = await this.withTimeout(
        adapter.trackShipment(externalTrackingNumber.externalTrackingNumber),
        this.configService.get<number>('TRACKING_PROVIDER_TIMEOUT_MS') ??
          DEFAULT_PROVIDER_TIMEOUT_MS,
      );

      await this.logApiRequest({
        providerId: shipment.providerId,
        shipmentId: shipment.id,
        adapterClass: shipment.provider.adapterClass,
        latencyMs: Date.now() - startedAt,
        responseStatus: 200,
        responsePayload: result as unknown as Prisma.InputJsonValue,
      });

      await this.persistNewEvents(
        shipment.id,
        shipment.providerId,
        externalTrackingNumber.id,
        result.events,
        shipment.order.customerId,
        internalTrackingNumber,
      );
    } catch (error) {
      await this.logApiRequest({
        providerId: shipment.providerId,
        shipmentId: shipment.id,
        adapterClass: shipment.provider.adapterClass,
        latencyMs: Date.now() - startedAt,
        responseStatus: null,
        responsePayload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      this.logger.error(
        `Provider lookup failed for ${internalTrackingNumber} [correlationId=${correlationId}]`,
        error instanceof Error ? error.stack : String(error),
      );
      return this.buildFallbackDto(internalTrackingNumber, shipment.id);
    }

    const dto = await this.buildDtoFromDb(internalTrackingNumber, shipment.id);
    await this.cacheResult(cacheKey, dto);
    return dto;
  }

  private async buildFallbackDto(
    internalTrackingNumber: string,
    shipmentId: string,
  ): Promise<TrackingResultDto> {
    const hasPriorData =
      (await this.prisma.trackingEvent.count({ where: { shipmentId } })) > 0;
    if (!hasPriorData) {
      throw new ServiceUnavailableException(
        'Temporarily unable to fetch live tracking status. Please try again shortly.',
      );
    }
    // Serve the last-known state rather than an error page (Section 4 reliability NFR) — the
    // lastUpdated timestamp in the response communicates staleness to the customer.
    return this.buildDtoFromDb(internalTrackingNumber, shipmentId);
  }

  private async persistNewEvents(
    shipmentId: string,
    providerId: string,
    externalTrackingNumberId: string,
    events: NormalizedTrackingEvent[],
    customerId: string,
    internalTrackingNumber: string,
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const statuses = await this.prisma.trackingStatus.findMany();
    const statusIdByCode = new Map(statuses.map((s) => [s.code, s.id]));

    const latest = await this.prisma.trackingEvent.findFirst({
      where: { shipmentId },
      orderBy: { eventTime: 'desc' },
    });
    const newEvents = latest
      ? events.filter((event) => event.eventTime > latest.eventTime)
      : events;

    if (newEvents.length === 0) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.trackingEvent.createMany({
        data: newEvents.map((event) => {
          const canonicalStatusId = statusIdByCode.get(event.status);
          if (!canonicalStatusId) {
            throw new Error(
              `Unknown canonical tracking status code: ${event.status}`,
            );
          }
          return {
            shipmentId,
            providerId,
            externalTrackingNumberId,
            rawStatus: event.rawStatus,
            canonicalStatusId,
            eventTime: event.eventTime,
            location: event.location,
            rawPayload:
              event.rawPayload === undefined
                ? Prisma.JsonNull
                : (event.rawPayload as Prisma.InputJsonValue),
          };
        }),
      }),
      this.prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          currentStatus: newEvents[newEvents.length - 1].status,
          lastSyncedAt: new Date(),
        },
      }),
    ]);

    await this.notificationsService.enqueue(
      customerId,
      'WHATSAPP',
      templateForTrackingStatus(newEvents[newEvents.length - 1].status),
      { trackingNumber: internalTrackingNumber },
    );
  }

  private async buildDtoFromDb(
    internalTrackingNumber: string,
    shipmentId: string,
  ): Promise<TrackingResultDto> {
    const [shipment, events] = await Promise.all([
      this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
      this.prisma.trackingEvent.findMany({
        where: { shipmentId },
        include: { canonicalStatus: true },
        orderBy: { eventTime: 'asc' },
      }),
    ]);

    return this.buildDto(
      internalTrackingNumber,
      shipment.currentStatus as TrackingStatusCode | null,
      shipment.lastSyncedAt,
      events.map((event) => ({
        status: event.canonicalStatus.code as TrackingStatusCode,
        displayLabel: event.canonicalStatus.displayLabel,
        eventTime: event.eventTime.toISOString(),
        location: event.location,
      })),
    );
  }

  private buildDto(
    internalTrackingNumber: string,
    currentStatus: TrackingStatusCode | null,
    lastUpdated: Date | null,
    events: TrackingResultDto['events'],
  ): TrackingResultDto {
    return {
      internalTrackingNumber,
      currentStatus,
      currentStatusLabel: currentStatus
        ? (events.find((e) => e.status === currentStatus)?.displayLabel ??
          currentStatus)
        : 'Tracking not yet available',
      lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
      events,
    };
  }

  private async cacheResult(
    cacheKey: string,
    dto: TrackingResultDto,
  ): Promise<void> {
    const isTerminal =
      dto.currentStatus && TERMINAL_STATUSES.includes(dto.currentStatus);
    const ttlSeconds = isTerminal
      ? (this.configService.get<number>(
          'TRACKING_CACHE_TTL_TERMINAL_SECONDS',
        ) ?? DEFAULT_TERMINAL_TTL_SECONDS)
      : (this.configService.get<number>('TRACKING_CACHE_TTL_ACTIVE_SECONDS') ??
        DEFAULT_ACTIVE_TTL_SECONDS);

    await this.redis.set(cacheKey, JSON.stringify(dto), 'EX', ttlSeconds);
  }

  private cacheKeyFor(internalTrackingNumber: string): string {
    return trackingCacheKey(internalTrackingNumber);
  }

  private async logApiRequest(entry: {
    providerId: string;
    shipmentId: string;
    adapterClass: string;
    latencyMs: number;
    responseStatus: number | null;
    responsePayload: Prisma.InputJsonValue;
  }): Promise<void> {
    // Observability logging must never break the actual tracking lookup — swallow failures.
    try {
      await this.prisma.apiRequestLog.create({
        data: {
          providerId: entry.providerId,
          shipmentId: entry.shipmentId,
          requestUrl: `adapter:${entry.adapterClass}#trackShipment`,
          responseStatus: entry.responseStatus,
          responsePayload: entry.responsePayload,
          latencyMs: entry.latencyMs,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write api_request_logs entry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Provider call timed out')),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
