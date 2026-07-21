import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShipmentsService } from './shipments.service';

function trackingNumberCollisionError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['internal_tracking_number'] },
  });
}

function otherUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['some_other_column'] },
  });
}

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
    service = new ShipmentsService(prisma as never, redis as never);
  });

  describe('createForOrder', () => {
    it('creates a shipment with a generated tracking number on the first attempt', async () => {
      prisma.shipment.create.mockResolvedValue({
        id: 's-1',
        internalTrackingNumber: 'NW-ABC',
      });

      const result = await service.createForOrder('order-1', 'provider-1');

      expect(result).toEqual({ id: 's-1', internalTrackingNumber: 'NW-ABC' });
      expect(prisma.shipment.create).toHaveBeenCalledTimes(1);
    });

    it('retries with a new tracking number when it collides, then succeeds', async () => {
      prisma.shipment.create
        .mockRejectedValueOnce(trackingNumberCollisionError())
        .mockResolvedValueOnce({ id: 's-1', internalTrackingNumber: 'NW-DEF' });

      const result = await service.createForOrder('order-1', 'provider-1');

      expect(result).toEqual({ id: 's-1', internalTrackingNumber: 'NW-DEF' });
      expect(prisma.shipment.create).toHaveBeenCalledTimes(2);

      const [firstCallArgs, secondCallArgs] = prisma.shipment.create.mock
        .calls as Array<[{ data: { internalTrackingNumber: string } }]>;
      expect(firstCallArgs[0].data.internalTrackingNumber).not.toBe(
        secondCallArgs[0].data.internalTrackingNumber,
      );
    });

    it('does not retry and rethrows when the unique violation is on a different column', async () => {
      prisma.shipment.create.mockRejectedValue(otherUniqueConstraintError());

      await expect(
        service.createForOrder('order-1', 'provider-1'),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
      expect(prisma.shipment.create).toHaveBeenCalledTimes(1);
    });

    it('gives up after the maximum number of collision retries', async () => {
      prisma.shipment.create.mockRejectedValue(trackingNumberCollisionError());

      await expect(
        service.createForOrder('order-1', 'provider-1'),
      ).rejects.toThrow(/unique internal tracking number/);
      expect(prisma.shipment.create).toHaveBeenCalledTimes(5);
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
    });
  });
});
