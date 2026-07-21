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

describe('ShipmentsService', () => {
  let prisma: { shipment: { create: jest.Mock } };
  let service: ShipmentsService;

  beforeEach(() => {
    prisma = { shipment: { create: jest.fn() } };
    service = new ShipmentsService(prisma as never);
  });

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
