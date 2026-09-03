import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';

const baseShipmentDetail = {
  id: 'shipment-1',
  providerId: 'provider-1',
  internalTrackingNumber: 'NW-1',
  currentStatus: null as string | null,
  provider: { id: 'provider-1', code: 'ICL' },
  externalTrackingNumbers: [] as Array<{
    id: string;
    providerId: string;
    externalTrackingNumber: string;
  }>,
  trackingEvents: [],
  order: { customerId: 'customer-1' },
};

interface AuditLogCallArgs {
  data: {
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    before: unknown;
    after: unknown;
  };
}

describe('ShipmentsService', () => {
  let prisma: {
    shipment: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    shippingProvider: { findUnique: jest.Mock };
    externalTrackingNumber: { findFirst: jest.Mock; upsert: jest.Mock };
    trackingStatus: { findUnique: jest.Mock };
    trackingEvent: { create: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRawUnsafe: jest.Mock;
  };
  let redis: { cacheDel: jest.Mock };
  let notificationsService: { enqueue: jest.Mock };
  let service: ShipmentsService;
  let auditLogCalls: AuditLogCallArgs[];

  beforeEach(() => {
    auditLogCalls = [];
    prisma = {
      shipment: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(baseShipmentDetail),
        update: jest.fn(),
      },
      shippingProvider: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'provider-1', code: 'ICL' }),
      },
      externalTrackingNumber: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      trackingStatus: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'status-in-transit', code: 'IN_TRANSIT' }),
      },
      trackingEvent: { create: jest.fn() },
      auditLog: {
        create: jest.fn().mockImplementation((args: AuditLogCallArgs) => {
          auditLogCalls.push(args);
          return Promise.resolve(args);
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((ops: unknown[]) => Promise.all(ops)),
      // Stands in for the atomic upsert on `counters` that allocates the sequence number.
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 42 }]),
    };
    redis = { cacheDel: jest.fn() };
    notificationsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new ShipmentsService(
      prisma as never,
      redis as never,
      notificationsService as never,
    );
  });

  describe('createForOrder', () => {
    it('allocates a sequence number from the counters collection and formats the tracking number from it', async () => {
      const createdAt = new Date('2026-07-24T00:00:00.000Z');
      prisma.shipment.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 's-1', ...data }),
      );

      const result = await service.createForOrder('order-1', 'provider-1');

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql, name] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        string,
      ];
      // One statement, and it must be the atomic upsert — a read-then-write would hand two
      // concurrent callers the same tracking number.
      expect(sql).toContain('INSERT INTO counters');
      expect(sql).toContain('ON CONFLICT');
      expect(name).toBe('shipment');

      expect(prisma.shipment.create).toHaveBeenCalledTimes(1);
      const [createArgs] = prisma.shipment.create.mock.calls[0] as [
        {
          data: {
            orderId: string;
            providerId: string;
            sequenceNumber: number;
            createdAt: Date;
            internalTrackingNumber: string;
          };
        },
      ];
      expect(createArgs.data.orderId).toBe('order-1');
      expect(createArgs.data.providerId).toBe('provider-1');
      expect(createArgs.data.sequenceNumber).toBe(42);
      expect(createArgs.data.internalTrackingNumber).toBe(
        `NW-${String(createArgs.data.createdAt.getFullYear()).slice(2)}-00000042`,
      );

      // The row is written once now — no placeholder to overwrite.
      expect(prisma.shipment.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 's-1', sequenceNumber: 42 });
      expect(createdAt).toBeInstanceOf(Date);
    });
  });

  describe('findByInternalTrackingNumber', () => {
    it('throws NotFoundException for an unknown tracking number', async () => {
      prisma.shipment.findUnique.mockResolvedValue(null);
      await expect(
        service.findByInternalTrackingNumber('NW-MISSING'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('mapExternalTrackingNumber', () => {
    it('creates a new mapping, resets status, and writes an audit log when none exists yet', async () => {
      await service.mapExternalTrackingNumber(
        'NW-1',
        'provider-1',
        'ICL-EXTERNAL-1',
        'actor-1',
      );

      expect(prisma.externalTrackingNumber.upsert).toHaveBeenCalledWith({
        where: {
          shipmentId_providerId: {
            shipmentId: 'shipment-1',
            providerId: 'provider-1',
          },
        },
        update: { externalTrackingNumber: 'ICL-EXTERNAL-1' },
        create: {
          shipmentId: 'shipment-1',
          providerId: 'provider-1',
          externalTrackingNumber: 'ICL-EXTERNAL-1',
        },
      });

      expect(prisma.shipment.update).toHaveBeenCalledWith({
        where: { id: 'shipment-1' },
        data: {
          providerId: 'provider-1',
          currentStatus: null,
          lastSyncedAt: null,
        },
      });

      expect(auditLogCalls).toHaveLength(1);
      expect(auditLogCalls[0].data.actorId).toBe('actor-1');
      expect(auditLogCalls[0].data.action).toBe('MAP_EXTERNAL_TRACKING_NUMBER');
      expect(auditLogCalls[0].data.entity).toBe('Shipment');
      expect(auditLogCalls[0].data.entityId).toBe('shipment-1');
      expect(auditLogCalls[0].data.before).toEqual({
        providerId: 'provider-1',
        providerCode: 'ICL',
        externalTrackingNumber: null,
      });
      expect(auditLogCalls[0].data.after).toEqual({
        providerId: 'provider-1',
        providerCode: 'ICL',
        externalTrackingNumber: 'ICL-EXTERNAL-1',
      });
    });

    it('updates the existing mapping for the same provider instead of creating a duplicate', async () => {
      prisma.shipment.findUnique.mockResolvedValue({
        ...baseShipmentDetail,
        externalTrackingNumbers: [
          {
            id: 'etn-1',
            providerId: 'provider-1',
            externalTrackingNumber: 'OLD-VALUE',
          },
        ],
      });

      await service.mapExternalTrackingNumber(
        'NW-1',
        'provider-1',
        'NEW-VALUE',
        'actor-1',
      );

      expect(prisma.externalTrackingNumber.upsert).toHaveBeenCalledWith({
        where: {
          shipmentId_providerId: {
            shipmentId: 'shipment-1',
            providerId: 'provider-1',
          },
        },
        update: { externalTrackingNumber: 'NEW-VALUE' },
        create: {
          shipmentId: 'shipment-1',
          providerId: 'provider-1',
          externalTrackingNumber: 'NEW-VALUE',
        },
      });
      expect(auditLogCalls[0].data.before).toEqual({
        providerId: 'provider-1',
        providerCode: 'ICL',
        externalTrackingNumber: 'OLD-VALUE',
      });
      expect(auditLogCalls[0].data.after).toEqual({
        providerId: 'provider-1',
        providerCode: 'ICL',
        externalTrackingNumber: 'NEW-VALUE',
      });
    });

    it('re-saving the same provider and AWB leaves currentStatus/lastSyncedAt untouched', async () => {
      prisma.shipment.findUnique.mockResolvedValue({
        ...baseShipmentDetail,
        externalTrackingNumbers: [
          {
            id: 'etn-1',
            providerId: 'provider-1',
            externalTrackingNumber: 'SAME-VALUE',
          },
        ],
      });

      await service.mapExternalTrackingNumber(
        'NW-1',
        'provider-1',
        'SAME-VALUE',
        'actor-1',
      );

      expect(prisma.shipment.update).toHaveBeenCalledWith({
        where: { id: 'shipment-1' },
        data: { providerId: 'provider-1' },
      });
    });

    it('reassigning to a different reseller updates providerId and resets status', async () => {
      prisma.shipment.findUnique.mockResolvedValue({
        ...baseShipmentDetail,
        externalTrackingNumbers: [
          {
            id: 'etn-1',
            providerId: 'provider-1',
            externalTrackingNumber: 'OLD-VALUE',
          },
        ],
      });
      prisma.shippingProvider.findUnique.mockResolvedValue({
        id: 'provider-2',
        code: 'RESELLER2',
      });

      await service.mapExternalTrackingNumber(
        'NW-1',
        'provider-2',
        'NEW-AWB',
        'actor-1',
      );

      expect(prisma.shipment.update).toHaveBeenCalledWith({
        where: { id: 'shipment-1' },
        data: {
          providerId: 'provider-2',
          currentStatus: null,
          lastSyncedAt: null,
        },
      });
      expect(auditLogCalls[0].data.before).toEqual({
        providerId: 'provider-1',
        providerCode: 'ICL',
        externalTrackingNumber: 'OLD-VALUE',
      });
      expect(auditLogCalls[0].data.after).toEqual({
        providerId: 'provider-2',
        providerCode: 'RESELLER2',
        externalTrackingNumber: 'NEW-AWB',
      });
    });

    it('throws NotFoundException when the provider does not exist', async () => {
      prisma.shippingProvider.findUnique.mockResolvedValue(null);

      await expect(
        service.mapExternalTrackingNumber(
          'NW-1',
          'unknown-provider',
          'ICL-EXTERNAL-1',
          'actor-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.externalTrackingNumber.upsert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the AWB is already assigned to another shipment for that provider', async () => {
      prisma.externalTrackingNumber.findFirst.mockResolvedValue({
        id: 'etn-other',
        shipmentId: 'shipment-2',
      });

      await expect(
        service.mapExternalTrackingNumber(
          'NW-1',
          'provider-1',
          'ALREADY-USED',
          'actor-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.externalTrackingNumber.upsert).not.toHaveBeenCalled();
    });
  });

  describe('overrideTrackingStatus', () => {
    it('throws NotFoundException for an unrecognized canonical status', async () => {
      prisma.trackingStatus.findUnique.mockResolvedValue(null);

      await expect(
        service.overrideTrackingStatus(
          'NW-1',
          { status: 'IN_TRANSIT' },
          'actor-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a tracking event, updates the shipment, invalidates the cache, and audit-logs the change', async () => {
      let trackingEventCallArgs:
        | {
            shipmentId: string;
            providerId: string;
            rawStatus: string;
            canonicalStatusId: string;
            location: string | null;
          }
        | undefined;
      prisma.trackingEvent.create.mockImplementation(
        (args: { data: typeof trackingEventCallArgs }) => {
          trackingEventCallArgs = args.data;
          return Promise.resolve(args);
        },
      );

      let shipmentUpdateCallArgs: { currentStatus: string } | undefined;
      prisma.shipment.update.mockImplementation(
        (args: { where: { id: string }; data: { currentStatus: string } }) => {
          shipmentUpdateCallArgs = args.data;
          return Promise.resolve(args);
        },
      );

      await service.overrideTrackingStatus(
        'NW-1',
        {
          status: 'IN_TRANSIT',
          location: 'Pune Hub',
          note: 'Carrier data was stale',
        },
        'actor-1',
      );

      expect(trackingEventCallArgs).toMatchObject({
        shipmentId: 'shipment-1',
        providerId: 'provider-1',
        rawStatus: 'MANUAL_OVERRIDE',
        canonicalStatusId: 'status-in-transit',
        location: 'Pune Hub',
      });
      expect(shipmentUpdateCallArgs).toMatchObject({
        currentStatus: 'IN_TRANSIT',
      });

      expect(auditLogCalls[0].data.actorId).toBe('actor-1');
      expect(auditLogCalls[0].data.action).toBe('OVERRIDE_TRACKING_STATUS');
      expect(auditLogCalls[0].data.before).toEqual({ currentStatus: null });
      expect(auditLogCalls[0].data.after).toEqual({
        currentStatus: 'IN_TRANSIT',
        note: 'Carrier data was stale',
      });

      expect(redis.cacheDel).toHaveBeenCalledWith('tracking:NW-1');
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'in_transit_update',
        { trackingNumber: 'NW-1' },
      );
    });
  });
});
