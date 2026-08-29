import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Shipment } from '@prisma/client';
import type { TrackingStatusCode } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { trackingCacheKey } from '../tracking/tracking-cache-key';
import { NotificationsService } from '../notifications/notifications.service';
import { templateForTrackingStatus } from '../notifications/templates';
import { nextSequenceNumber } from './sequence';
import { formatInternalTrackingNumber } from './tracking-number';

const MANUAL_OVERRIDE_RAW_STATUS = 'MANUAL_OVERRIDE';

const withAdminDetail = {
  include: {
    provider: true,
    externalTrackingNumbers: true,
    trackingEvents: {
      include: { canonicalStatus: true },
      orderBy: { eventTime: 'asc' as const },
    },
    order: { select: { customerId: true } },
  },
};
export type ShipmentAdminDetail = Prisma.ShipmentGetPayload<
  typeof withAdminDetail
>;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // The customer-facing number embeds a sequential counter (Section: sequential tracking
  // numbers) plus the row's creation date, so the number is allocated first and the row is
  // written once — no placeholder-then-overwrite dance is needed now that the sequence value
  // does not come from the insert itself.
  async createForOrder(orderId: string, providerId: string): Promise<Shipment> {
    const sequenceNumber = await nextSequenceNumber(this.prisma);
    const createdAt = new Date();

    return this.prisma.shipment.create({
      data: {
        orderId,
        providerId,
        sequenceNumber,
        createdAt,
        internalTrackingNumber: formatInternalTrackingNumber(
          sequenceNumber,
          createdAt,
        ),
      },
    });
  }

  /** Staff-facing view: raw provider data alongside the normalized event history (Section 3). */
  async findByInternalTrackingNumber(
    internalTrackingNumber: string,
  ): Promise<ShipmentAdminDetail> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { internalTrackingNumber },
      ...withAdminDetail,
    });
    if (!shipment) {
      throw new NotFoundException(
        `Tracking number ${internalTrackingNumber} not found`,
      );
    }
    return shipment;
  }

  /**
   * Maps (or re-maps) a shipment to a reseller/provider + that provider's AWB. Until an AWB
   * exists, the public tracking endpoint reports "Tracking not yet available" (Section 5). The
   * reseller can be changed here too — the shipment's provider_id is the source of truth for
   * which adapter TrackingService dispatches to, so re-pointing it is how staff reassign a
   * shipment to a different reseller after booking.
   */
  async mapExternalTrackingNumber(
    internalTrackingNumber: string,
    providerId: string,
    externalTrackingNumber: string,
    actorId: string,
  ): Promise<ShipmentAdminDetail> {
    const shipment = await this.findByInternalTrackingNumber(
      internalTrackingNumber,
    );

    const provider = await this.prisma.shippingProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException(`Shipping provider ${providerId} not found`);
    }

    // Same AWB should never quietly end up on two different shipments for the same reseller.
    const conflicting = await this.prisma.externalTrackingNumber.findFirst({
      where: {
        providerId,
        externalTrackingNumber,
        NOT: { shipmentId: shipment.id },
      },
    });
    if (conflicting) {
      throw new ConflictException(
        `AWB ${externalTrackingNumber} is already assigned to another shipment for ${provider.code}`,
      );
    }

    const activeMapping = shipment.externalTrackingNumbers.find(
      (etn) => etn.providerId === shipment.providerId,
    );
    const isChanging =
      shipment.providerId !== providerId ||
      activeMapping?.externalTrackingNumber !== externalTrackingNumber;

    await this.prisma.$transaction([
      this.prisma.externalTrackingNumber.upsert({
        where: {
          shipmentId_providerId: { shipmentId: shipment.id, providerId },
        },
        update: { externalTrackingNumber },
        create: { shipmentId: shipment.id, providerId, externalTrackingNumber },
      }),
      this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          providerId,
          ...(isChanging ? { currentStatus: null, lastSyncedAt: null } : {}),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'MAP_EXTERNAL_TRACKING_NUMBER',
          entity: 'Shipment',
          entityId: shipment.id,
          before: {
            providerId: shipment.providerId,
            providerCode: shipment.provider.code,
            externalTrackingNumber:
              activeMapping?.externalTrackingNumber ?? null,
          },
          after: {
            providerId,
            providerCode: provider.code,
            externalTrackingNumber,
          },
        },
      }),
    ]);

    return this.findByInternalTrackingNumber(internalTrackingNumber);
  }

  /**
   * Staff correction when carrier data is wrong or delayed (Section 3). Always recorded as a
   * new append-only TrackingEvent — never edits history — and invalidates the public cache
   * entry so customers see the correction immediately rather than waiting out the TTL.
   */
  async overrideTrackingStatus(
    internalTrackingNumber: string,
    input: { status: TrackingStatusCode; location?: string; note?: string },
    actorId: string,
  ): Promise<ShipmentAdminDetail> {
    const shipment = await this.findByInternalTrackingNumber(
      internalTrackingNumber,
    );

    const canonicalStatus = await this.prisma.trackingStatus.findUnique({
      where: { code: input.status },
    });
    if (!canonicalStatus) {
      throw new NotFoundException(
        `Unknown canonical tracking status: ${input.status}`,
      );
    }

    const previousStatus = shipment.currentStatus;
    const eventTime = new Date();

    await this.prisma.$transaction([
      this.prisma.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          providerId: shipment.providerId,
          rawStatus: MANUAL_OVERRIDE_RAW_STATUS,
          canonicalStatusId: canonicalStatus.id,
          eventTime,
          location: input.location ?? null,
        },
      }),
      this.prisma.shipment.update({
        where: { id: shipment.id },
        data: { currentStatus: input.status, lastSyncedAt: eventTime },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'OVERRIDE_TRACKING_STATUS',
          entity: 'Shipment',
          entityId: shipment.id,
          before: { currentStatus: previousStatus },
          after: { currentStatus: input.status, note: input.note ?? null },
        },
      }),
    ]);

    await this.redis.cacheDel(trackingCacheKey(internalTrackingNumber));

    await this.notificationsService.enqueue(
      shipment.order.customerId,
      'WHATSAPP',
      templateForTrackingStatus(input.status),
      { trackingNumber: internalTrackingNumber },
    );

    return this.findByInternalTrackingNumber(internalTrackingNumber);
  }
}
