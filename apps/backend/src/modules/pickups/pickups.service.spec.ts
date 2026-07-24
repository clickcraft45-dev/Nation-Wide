import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PickupsService } from './pickups.service';

const basePickup = {
  id: 'pickup-1',
  method: 'PICKUP',
  status: 'SCHEDULED',
  weightVerifiedKg: null,
  notes: null,
  quote: { customerId: 'customer-1', customer: { name: 'A', phone: '+911234567890' } },
};

describe('PickupsService', () => {
  let prisma: {
    pickup: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let notificationsService: { enqueue: jest.Mock };
  let service: PickupsService;

  beforeEach(() => {
    prisma = {
      pickup: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(basePickup),
        update: jest.fn().mockResolvedValue(basePickup),
      },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    notificationsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new PickupsService(prisma as never, notificationsService as never);
  });

  describe('updateStatus — PICKUP method transitions', () => {
    it('allows SCHEDULED -> PENDING', async () => {
      await service.updateStatus('pickup-1', { status: 'PENDING' }, 'actor-1');
      expect(prisma.pickup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pickup-1' },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('rejects an out-of-order jump (SCHEDULED -> PICKED_UP)', async () => {
      await expect(
        service.updateStatus('pickup-1', { status: 'PICKED_UP' }, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pickup.update).not.toHaveBeenCalled();
    });

    it('rejects transitioning out of a terminal state', async () => {
      prisma.pickup.findUnique.mockResolvedValue({ ...basePickup, status: 'PICKED_UP' });
      await expect(
        service.updateStatus('pickup-1', { status: 'PENDING' }, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('records the actor and timestamp when marking PICKED_UP, and notifies the customer', async () => {
      prisma.pickup.findUnique.mockResolvedValue({
        ...basePickup,
        status: 'PICKUP_IN_PROGRESS',
      });

      await service.updateStatus(
        'pickup-1',
        { status: 'PICKED_UP', weightVerifiedKg: 4.2 },
        'actor-1',
      );

      expect(prisma.pickup.update).toHaveBeenCalledWith({
        where: { id: 'pickup-1' },
        data: expect.objectContaining({
          status: 'PICKED_UP',
          weightVerifiedKg: 4.2,
          confirmedByAdminId: 'actor-1',
          confirmedAt: expect.any(Date),
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PICKUP_MARKED_PICKED_UP' }),
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_or_dropoff_confirmed',
        { status: 'PICKED_UP' },
      );
    });
  });

  describe('updateStatus — WAREHOUSE_DROP_OFF method transitions', () => {
    it('allows SCHEDULED -> DROPPED_OFF directly (no intermediate states)', async () => {
      prisma.pickup.findUnique.mockResolvedValue({
        ...basePickup,
        method: 'WAREHOUSE_DROP_OFF',
        status: 'SCHEDULED',
      });

      await service.updateStatus('pickup-1', { status: 'DROPPED_OFF' }, 'actor-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'WAREHOUSE_DROP_OFF_CONFIRMED' }),
        }),
      );
    });

    it('rejects the PICKUP-only PENDING status for a drop-off', async () => {
      prisma.pickup.findUnique.mockResolvedValue({
        ...basePickup,
        method: 'WAREHOUSE_DROP_OFF',
        status: 'SCHEDULED',
      });
      await expect(
        service.updateStatus('pickup-1', { status: 'PENDING' }, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown pickup', async () => {
      prisma.pickup.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll / findDropOffs', () => {
    it('scopes findAll to method PICKUP', async () => {
      await service.findAll({});
      expect(prisma.pickup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ method: 'PICKUP' }),
        }),
      );
    });

    it('scopes findDropOffs to method WAREHOUSE_DROP_OFF', async () => {
      await service.findDropOffs({});
      expect(prisma.pickup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ method: 'WAREHOUSE_DROP_OFF' }),
        }),
      );
    });
  });
});
