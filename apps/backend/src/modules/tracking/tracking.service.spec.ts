import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

const CANONICAL_STATUSES = [
  { id: 'status-picked-up', code: 'PICKED_UP', displayLabel: 'Picked Up' },
  { id: 'status-in-transit', code: 'IN_TRANSIT', displayLabel: 'In Transit' },
  { id: 'status-delivered', code: 'DELIVERED', displayLabel: 'Delivered' },
];

const baseShipment = {
  id: 'shipment-1',
  providerId: 'provider-1',
  provider: { id: 'provider-1', adapterClass: 'StubShippingProviderAdapter' },
};

describe('TrackingService', () => {
  let prisma: {
    shipment: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    trackingEvent: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      createMany: jest.Mock;
    };
    trackingStatus: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let redis: { get: jest.Mock; set: jest.Mock };
  let providerRegistry: { resolve: jest.Mock };
  let configService: { get: jest.Mock };
  let service: TrackingService;

  beforeEach(() => {
    prisma = {
      shipment: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'shipment-1',
          currentStatus: null,
          lastSyncedAt: null,
        }),
        update: jest.fn(),
      },
      trackingEvent: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      trackingStatus: {
        findMany: jest.fn().mockResolvedValue(CANONICAL_STATUSES),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    providerRegistry = { resolve: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    service = new TrackingService(
      prisma as never,
      redis as never,
      providerRegistry as never,
      configService as never,
    );
  });

  it('throws NotFoundException for an unknown tracking number', async () => {
    prisma.shipment.findUnique.mockResolvedValue(null);

    await expect(service.getStatus('NW-UNKNOWN')).rejects.toThrow(
      NotFoundException,
    );
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('returns the cached result on a cache hit without calling the provider', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      ...baseShipment,
      externalTrackingNumbers: [
        { id: 'ext-1', externalTrackingNumber: 'ICL-1' },
      ],
    });
    const cachedDto = {
      internalTrackingNumber: 'NW-1',
      currentStatus: 'DELIVERED',
      currentStatusLabel: 'Delivered',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      events: [],
    };
    redis.get.mockResolvedValue(JSON.stringify(cachedDto));

    const result = await service.getStatus('NW-1');

    expect(result).toEqual(cachedDto);
    expect(providerRegistry.resolve).not.toHaveBeenCalled();
  });

  it('returns "not yet available" without calling the provider when no external number is mapped', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      ...baseShipment,
      externalTrackingNumbers: [],
    });

    const result = await service.getStatus('NW-1');

    expect(result).toEqual({
      internalTrackingNumber: 'NW-1',
      currentStatus: null,
      currentStatusLabel: 'Tracking not yet available',
      lastUpdated: null,
      events: [],
    });
    expect(providerRegistry.resolve).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('fetches from the provider on a cache miss, persists new events, and caches the result', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      ...baseShipment,
      externalTrackingNumbers: [
        { id: 'ext-1', externalTrackingNumber: 'ICL-1' },
      ],
    });
    const eventTime = new Date('2026-01-01T00:00:00.000Z');
    providerRegistry.resolve.mockReturnValue({
      trackShipment: jest.fn().mockResolvedValue({
        events: [
          {
            status: 'PICKED_UP',
            rawStatus: 'PICKED_UP',
            eventTime,
            location: 'Mumbai',
          },
        ],
      }),
    });
    prisma.shipment.findUniqueOrThrow.mockResolvedValue({
      id: 'shipment-1',
      currentStatus: 'PICKED_UP',
      lastSyncedAt: eventTime,
    });
    prisma.trackingEvent.findMany.mockResolvedValue([
      {
        canonicalStatus: { code: 'PICKED_UP', displayLabel: 'Picked Up' },
        eventTime,
        location: 'Mumbai',
      },
    ]);

    let updateCallArgs:
      | {
          where: { id: string };
          data: { currentStatus: string; lastSyncedAt: Date };
        }
      | undefined;
    prisma.shipment.update.mockImplementation(
      (args: {
        where: { id: string };
        data: { currentStatus: string; lastSyncedAt: Date };
      }) => {
        updateCallArgs = args;
        return Promise.resolve(args);
      },
    );

    const result = await service.getStatus('NW-1');

    expect(providerRegistry.resolve).toHaveBeenCalledWith(
      'StubShippingProviderAdapter',
    );
    expect(prisma.trackingEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          shipmentId: 'shipment-1',
          canonicalStatusId: 'status-picked-up',
          rawStatus: 'PICKED_UP',
        }),
      ],
    });

    expect(updateCallArgs?.where).toEqual({ id: 'shipment-1' });
    expect(updateCallArgs?.data.currentStatus).toBe('PICKED_UP');
    expect(updateCallArgs?.data.lastSyncedAt).toBeInstanceOf(Date);
    expect(result.currentStatus).toBe('PICKED_UP');
    expect(redis.set).toHaveBeenCalledWith(
      'tracking:NW-1',
      expect.any(String),
      'EX',
      300, // default active TTL
    );
  });

  it('does not persist events that are not newer than the latest known event', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      ...baseShipment,
      externalTrackingNumbers: [
        { id: 'ext-1', externalTrackingNumber: 'ICL-1' },
      ],
    });
    const oldEventTime = new Date('2026-01-01T00:00:00.000Z');
    prisma.trackingEvent.findFirst.mockResolvedValue({
      eventTime: oldEventTime,
    });
    providerRegistry.resolve.mockReturnValue({
      trackShipment: jest.fn().mockResolvedValue({
        events: [
          {
            status: 'PICKED_UP',
            rawStatus: 'PICKED_UP',
            eventTime: oldEventTime,
            location: null,
          },
        ],
      }),
    });

    await service.getStatus('NW-1');

    expect(prisma.trackingEvent.createMany).not.toHaveBeenCalled();
    expect(prisma.shipment.update).not.toHaveBeenCalled();
  });

  it('falls back to last-known data when the provider call fails and prior data exists', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      ...baseShipment,
      externalTrackingNumbers: [
        { id: 'ext-1', externalTrackingNumber: 'ICL-1' },
      ],
    });
    providerRegistry.resolve.mockReturnValue({
      trackShipment: jest
        .fn()
        .mockRejectedValue(new Error('provider unreachable')),
    });
    prisma.trackingEvent.count.mockResolvedValue(2);
    prisma.shipment.findUniqueOrThrow.mockResolvedValue({
      id: 'shipment-1',
      currentStatus: 'IN_TRANSIT',
      lastSyncedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.trackingEvent.findMany.mockResolvedValue([
      {
        canonicalStatus: { code: 'IN_TRANSIT', displayLabel: 'In Transit' },
        eventTime: new Date('2026-01-01T00:00:00.000Z'),
        location: null,
      },
    ]);

    const result = await service.getStatus('NW-1');

    expect(result.currentStatus).toBe('IN_TRANSIT');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when the provider call fails and there is no prior data', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      ...baseShipment,
      externalTrackingNumbers: [
        { id: 'ext-1', externalTrackingNumber: 'ICL-1' },
      ],
    });
    providerRegistry.resolve.mockReturnValue({
      trackShipment: jest
        .fn()
        .mockRejectedValue(new Error('provider unreachable')),
    });
    prisma.trackingEvent.count.mockResolvedValue(0);

    await expect(service.getStatus('NW-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('treats a provider call that exceeds the timeout the same as a failure', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      ...baseShipment,
      externalTrackingNumbers: [
        { id: 'ext-1', externalTrackingNumber: 'ICL-1' },
      ],
    });
    configService.get.mockImplementation((key: string) =>
      key === 'TRACKING_PROVIDER_TIMEOUT_MS' ? 10 : undefined,
    );
    providerRegistry.resolve.mockReturnValue({
      trackShipment: jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(resolve, 200, { events: [] })),
        ),
    });
    prisma.trackingEvent.count.mockResolvedValue(0);

    await expect(service.getStatus('NW-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
