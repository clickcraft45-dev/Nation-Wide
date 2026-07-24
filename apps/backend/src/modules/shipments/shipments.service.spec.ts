import { NotFoundException } from '@nestjs/common';
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
    externalTrackingNumber: { create: jest.Mock; update: jest.Mock };
    trackingStatus: { findUnique: jest.Mock };
    trackingEvent: { create: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let redis: { del: jest.Mock };
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
      externalTrackingNumber: { create: jest.fn(), update: jest.fn() },
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
    };
    redis = { del: jest.fn() };
    notificationsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new ShipmentsService(
      prisma as never,
      redis as never,
      notificationsService as never,
    );
  });

  describe('createForOrder', () => {
    it('creates a placeholder row, then formats the real tracking number from the DB-assigned sequenceNumber', async () => {
      const createdAt = new Date('2026-07-24T00:00:00.000Z');
      prisma.shipment.create.mockResolvedValue({
        id: 's-1',
        sequenceNumber: 42,
        createdAt,
        internalTrackingNumber: 'PENDING-placeholder',
      });
      prisma.shipment.update.mockResolvedValue({
        id: 's-1',
        sequenceNumber: 42,
        createdAt,
        internalTrackingNumber: 'NW-26-00000042',
      });

      const result = await service.createForOrder('order-1', 'provider-1');

      expect(result).toEqual({
        id: 's-1',
        sequenceNumber: 42,
        createdAt,
        internalTrackingNumber: 'NW-26-00000042',
      });
      expect(prisma.shipment.create).toHaveBeenCalledTimes(1);
      const [createArgs] = prisma.shipment.create.mock.calls[0] as [
        { data: { orderId: string; providerId: string; internalTrackingNumber: string } },
      ];
      expect(createArgs.data.orderId).toBe('order-1');
      expect(createArgs.data.providerId).toBe('provider-1');
      expect(createArgs.data.internalTrackingNumber).toMatch(/^PENDING-/);

      expect(prisma.shipment.update).toHaveBeenCalledWith({
        where: { id: 's-1' },
        data: { internalTrackingNumber: 'NW-26-00000042' },
      });
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
    it('creates a new mapping and writes an audit log when none exists yet', async () => {
      await service.mapExternalTrackingNumber(
        'NW-1',
        'ICL-EXTERNAL-1',
        'actor-1',
      );

      expect(prisma.externalTrackingNumber.create).toHaveBeenCalledWith({
        data: {
          shipmentId: 'shipment-1',
          providerId: 'provider-1',
          externalTrackingNumber: 'ICL-EXTERNAL-1',
        },
      });
      expect(prisma.externalTrackingNumber.update).not.toHaveBeenCalled();

      expect(auditLogCalls).toHaveLength(1);
      expect(auditLogCalls[0].data.actorId).toBe('actor-1');
      expect(auditLogCalls[0].data.action).toBe('MAP_EXTERNAL_TRACKING_NUMBER');
      expect(auditLogCalls[0].data.entity).toBe('Shipment');
      expect(auditLogCalls[0].data.entityId).toBe('shipment-1');
      expect(auditLogCalls[0].data.before).toEqual({
        externalTrackingNumber: null,
      });
      expect(auditLogCalls[0].data.after).toEqual({
        externalTrackingNumber: 'ICL-EXTERNAL-1',
      });
    });

    it('updates the existing mapping for the shipment provider instead of creating a duplicate', async () => {
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

      await service.mapExternalTrackingNumber('NW-1', 'NEW-VALUE', 'actor-1');

      expect(prisma.externalTrackingNumber.update).toHaveBeenCalledWith({
        where: { id: 'etn-1' },
        data: { externalTrackingNumber: 'NEW-VALUE' },
      });
      expect(prisma.externalTrackingNumber.create).not.toHaveBeenCalled();
      expect(auditLogCalls[0].data.before).toEqual({
        externalTrackingNumber: 'OLD-VALUE',
      });
      expect(auditLogCalls[0].data.after).toEqual({
        externalTrackingNumber: 'NEW-VALUE',
      });
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

      expect(redis.del).toHaveBeenCalledWith('tracking:NW-1');
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'in_transit_update',
        { trackingNumber: 'NW-1' },
      );
    });
  });
});
