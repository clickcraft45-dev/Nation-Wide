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
  ShipmentItemDto,
  TrackingResultDto,
  TrackingStatusCode,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import { RedisService } from '../../database/redis.service';
import { ProviderAdapterRegistry } from '../provider-integration/provider-adapter.registry';
import type { NormalizedTrackingEvent } from '../provider-integration/interfaces/shipping-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { templateForTrackingStatus } from '../notifications/templates';
import { trackingCacheKey } from './tracking-cache-key';
import { carrierTrackingUrl } from './carrier-tracking-url';

const DEFAULT_PROVIDER_TIMEOUT_MS = 6000;
const DEFAULT_ACTIVE_TTL_SECONDS = 300;
const DEFAULT_TERMINAL_TTL_SECONDS = 86400;
const TERMINAL_STATUSES: TrackingStatusCode[] = ['DELIVERED'];

/** Everything about the parcel that does not come from the scan feed: who sent it, what is in it,
 *  and which carrier is carrying it. Threaded through the builders so the DTO says the same thing
 *  on the live path, the cached path and the stale-data fallback. */
type ShipmentDetails = Pick<
  TrackingResultDto,
  'customerName' | 'items' | 'carrier'
>;

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly providerRegistry: ProviderAdapterRegistry,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly reviews: ReviewsService,
  ) {}

  async getStatus(reference: string): Promise<TrackingResultDto> {
    const shipment = await this.findShipmentByReference(reference);
    if (!shipment) {
      throw new NotFoundException(`Tracking number ${reference} not found`);
    }

    // Canonical from here down. Everything below — the cache key above all — must key off the
    // shipment's OWN number rather than whatever the customer typed: ShipmentsService busts the
    // cache with trackingCacheKey(internalTrackingNumber) after a manual override, so caching a
    // result under an AWB or an order id would leave that entry stale and unreachable.
    const internalTrackingNumber = shipment.internalTrackingNumber;

    const cacheKey = this.cacheKeyFor(internalTrackingNumber);
    const cached = await this.redis.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TrackingResultDto;
    }

    // A shipment can accumulate one ExternalTrackingNumber row per reseller it has ever been
    // assigned to (see ShipmentsService.mapExternalTrackingNumber); only the row for the
    // shipment's *current* provider is the live mapping — picking index [0] would risk calling
    // the wrong adapter with a stale AWB left over from a previous reseller.
    const externalTrackingNumber = shipment.externalTrackingNumbers.find(
      (etn) => etn.providerId === shipment.providerId,
    );
    const details: ShipmentDetails = {
      customerName: shipment.order.customer.name,
      items: (shipment.order.quote?.items as ShipmentItemDto[] | null) ?? [],
      carrier: externalTrackingNumber
        ? {
            code: shipment.provider.code,
            name: shipment.provider.name,
            trackingNumber: externalTrackingNumber.externalTrackingNumber,
            trackingUrl: carrierTrackingUrl(
              shipment.provider.code,
              externalTrackingNumber.externalTrackingNumber,
            ),
          }
        : null,
    };

    if (!externalTrackingNumber) {
      // Shipment exists, but no carrier tracking number has been mapped yet (Section 3: staff
      // maps this manually, or a future real adapter's createShipment() call would set it).
      return this.buildDto(internalTrackingNumber, details, null, null, []);
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
      return this.buildFallbackDto(internalTrackingNumber, details, shipment.id);
    }

    const dto = await this.buildDtoFromDb(
      internalTrackingNumber,
      details,
      shipment.id,
    );
    await this.cacheResult(cacheKey, dto);
    return dto;
  }

  /**
   * Resolve whatever the customer pasted into a shipment.
   *
   * The lookup used to be `findUnique({ internalTrackingNumber })` and nothing else, while every
   * entry point invites more than that: the search box says "Order ID / Tracking ID" and the
   * homepage hero says "Use the Order ID from your confirmation, or the carrier tracking ID".
   * Two of those three simply returned "not found", and a number typed in lower case or pasted
   * with a trailing space failed as well — the reference is minted upper case (NW-26-000123).
   *
   * Order of preference is deliberate: our own number first (the one notifications hand out and
   * the only one guaranteed unique), then the carrier AWB, then the order id. A shipment is
   * looked up by at most three cheap indexed queries, and only when the earlier ones miss.
   */
  private findShipmentByReference(reference: string) {
    const trimmed = reference.trim();
    if (!trimmed) return Promise.resolve(null);

    const include = {
      provider: true,
      externalTrackingNumbers: true,
      order: {
        select: {
          customerId: true,
          customer: { select: { name: true } },
          // Contents live on the quote the order was accepted from — the commercial-invoice
          // lines the customer (or the pickup partner at the door) filled in.
          quote: { select: { items: true } },
        },
      },
    } as const;

    return this.prisma.shipment
      .findUnique({
        where: { internalTrackingNumber: trimmed.toUpperCase() },
        include,
      })
      .then(
        (byInternal) =>
          byInternal ??
          this.prisma.shipment.findFirst({
            where: {
              externalTrackingNumbers: {
                some: {
                  externalTrackingNumber: {
                    equals: trimmed,
                    mode: 'insensitive',
                  },
                },
              },
            },
            include,
          }),
      )
      .then(
        (found) =>
          found ??
          // Order ids are uuids, so this only ever matches a full one — the truncated 8-character
          // form the tables display is not a lookup key and must not be treated as one.
          this.prisma.shipment.findFirst({
            where: { orderId: trimmed },
            include,
            orderBy: { createdAt: 'asc' },
          }),
      );
  }

  private async buildFallbackDto(
    internalTrackingNumber: string,
    details: ShipmentDetails,
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
    return this.buildDtoFromDb(internalTrackingNumber, details, shipmentId);
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
            // Prisma.DbNull, not null: on the Postgres connector a bare `null` in a nullable
            // Json column is ambiguous (JSON `null` vs SQL NULL) and rejected at the type level.
            // DbNull is the SQL NULL the Mongo connector used to write for a plain null.
            rawPayload: event.rawPayload ?? Prisma.DbNull,
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

    // Delivery is the moment to ask, while the experience is fresh. Idempotent and non-throwing,
    // so a status that flaps or a re-sync cannot mail the customer twice and a mail outage
    // cannot fail the status update that already happened.
    if (newEvents[newEvents.length - 1].status === 'DELIVERED') {
      await this.reviews.requestFeedback(shipmentId);
    }
  }

  private async buildDtoFromDb(
    internalTrackingNumber: string,
    details: ShipmentDetails,
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
      details,
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
    details: ShipmentDetails,
    currentStatus: TrackingStatusCode | null,
    lastUpdated: Date | null,
    events: TrackingResultDto['events'],
  ): TrackingResultDto {
    return {
      internalTrackingNumber,
      ...details,
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

    await this.redis.cacheSet(cacheKey, JSON.stringify(dto), ttlSeconds);
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
