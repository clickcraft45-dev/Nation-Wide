import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Shipment } from '@prisma/client';
import type { TrackingStatusCode } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { trackingCacheKey } from '../tracking/tracking-cache-key';
import { generateInternalTrackingNumber } from './tracking-number';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const MAX_GENERATION_ATTEMPTS = 5;
const MANUAL_OVERRIDE_RAW_STATUS = 'MANUAL_OVERRIDE';

const withAdminDetail = {
  include: {
    provider: true,
    externalTrackingNumbers: true,
    trackingEvents: {
      include: { canonicalStatus: true },
      orderBy: { eventTime: 'asc' as const },
    },
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
  ) {}

  async createForOrder(orderId: string, providerId: string): Promise<Shipment> {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.shipment.create({
          data: {
            orderId,
            providerId,
            internalTrackingNumber: generateInternalTrackingNumber(),
          },
        });
      } catch (error) {
        const isTrackingNumberCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_CONSTRAINT_VIOLATION &&
          (error.meta?.target as string[] | undefined)?.includes(
            'internal_tracking_number',
          );

        if (!isTrackingNumberCollision) {
          throw error;
        }
        // Astronomically unlikely (40 bits of randomness) but cheap to guard against — retry
        // with a freshly generated number rather than surfacing a confusing 500 to staff.
      }
    }

    throw new Error(
      `Failed to generate a unique internal tracking number after ${MAX_GENERATION_ATTEMPTS} attempts`,
    );
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
   * Maps (or re-maps) the shipment's carrier tracking number for its own provider. Until this
   * exists, the public tracking endpoint reports "Tracking not yet available" (Section 5).
   */
  async mapExternalTrackingNumber(
    internalTrackingNumber: string,
    externalTrackingNumber: string,
    actorId: string,
  ): Promise<ShipmentAdminDetail> {
    const shipment = await this.findByInternalTrackingNumber(
      internalTrackingNumber,
    );
    const existing = shipment.externalTrackingNumbers.find(
      (etn) => etn.providerId === shipment.providerId,
    );

    if (existing) {
      await this.prisma.externalTrackingNumber.update({
        where: { id: existing.id },
        data: { externalTrackingNumber },
      });
    } else {
      await this.prisma.externalTrackingNumber.create({
        data: {
          shipmentId: shipment.id,
          providerId: shipment.providerId,
          externalTrackingNumber,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'MAP_EXTERNAL_TRACKING_NUMBER',
        entity: 'Shipment',
        entityId: shipment.id,
        before: {
          externalTrackingNumber: existing?.externalTrackingNumber ?? null,
        },
        after: { externalTrackingNumber },
      },
    });

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

    await this.redis.del(trackingCacheKey(internalTrackingNumber));

    return this.findByInternalTrackingNumber(internalTrackingNumber);
  }
}
