import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';

function recordNotFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: '6.19.3',
  });
}

describe('OrdersService', () => {
  const order = {
    id: 'order-1',
    customerId: 'customer-1',
    status: 'PENDING' as const,
  };
  const orderWithShipments = { ...order, shipments: [{ id: 'shipment-1' }] };
  const iclProvider = { id: 'provider-1', code: 'ICL' };

  let prisma: {
    order: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    shippingProvider: { findUnique: jest.Mock };
  };
  let customersService: { findOne: jest.Mock };
  let shipmentsService: { createForOrder: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    prisma = {
      order: {
        create: jest.fn().mockResolvedValue(order),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(orderWithShipments),
        update: jest.fn().mockResolvedValue(order),
      },
      shippingProvider: {
        findUnique: jest.fn().mockResolvedValue(iclProvider),
      },
    };
    customersService = {
      findOne: jest.fn().mockResolvedValue({ id: 'customer-1' }),
    };
    shipmentsService = {
      createForOrder: jest.fn().mockResolvedValue({ id: 'shipment-1' }),
    };

    service = new OrdersService(
      prisma as never,
      customersService as never,
      shipmentsService as never,
    );
  });

  describe('create', () => {
    it('validates the customer exists before creating anything', async () => {
      customersService.findOne.mockRejectedValue(
        new NotFoundException('Customer x not found'),
      );

      await expect(
        service.create({ customerId: 'missing-customer' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(shipmentsService.createForOrder).not.toHaveBeenCalled();
    });

    it('defaults to the ICL provider when providerCode is omitted', async () => {
      await service.create({ customerId: 'customer-1' });
      expect(prisma.shippingProvider.findUnique).toHaveBeenCalledWith({
        where: { code: 'ICL' },
      });
    });

    it('throws BadRequestException for an unknown provider code', async () => {
      prisma.shippingProvider.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ customerId: 'customer-1', providerCode: 'NOPE' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('creates an order and a linked shipment, returning the order with shipments', async () => {
      const result = await service.create({ customerId: 'customer-1' });

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: { customerId: 'customer-1' },
      });
      expect(shipmentsService.createForOrder).toHaveBeenCalledWith(
        'order-1',
        'provider-1',
      );
      expect(result).toEqual(orderWithShipments);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.update.mockRejectedValue(recordNotFoundError());

      await expect(
        service.update('missing-order', { status: 'CONFIRMED' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
