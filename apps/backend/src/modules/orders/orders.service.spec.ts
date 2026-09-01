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
    auditLog: { create: jest.Mock };
  };
  let customersService: { findOne: jest.Mock };
  let shipmentsService: { createForOrder: jest.Mock };
  let notificationsService: { enqueue: jest.Mock };
  let invoices: { generateForOrder: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    prisma = {
      order: {
        create: jest.fn().mockResolvedValue(order),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(orderWithShipments),
        update: jest.fn().mockResolvedValue(order),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      shippingProvider: {
        findUnique: jest.fn().mockResolvedValue(iclProvider),
      },
    };
    customersService = {
      findOne: jest.fn().mockResolvedValue({ id: 'customer-1' }),
    };
    shipmentsService = {
      createForOrder: jest.fn().mockResolvedValue({
        id: 'shipment-1',
        internalTrackingNumber: 'NW-1',
      }),
    };
    notificationsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    invoices = {
      generateForOrder: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    };

    service = new OrdersService(
      prisma as never,
      customersService as never,
      shipmentsService as never,
      notificationsService as never,
      invoices as never,
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
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'order_confirmation',
        { trackingNumber: 'NW-1' },
      );
    });
  });

  describe('createOrderWithShipment', () => {
    it('creates an order and linked shipment without enqueueing a notification', async () => {
      const result = await service.createOrderWithShipment('customer-1');

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: { customerId: 'customer-1' },
      });
      expect(shipmentsService.createForOrder).toHaveBeenCalledWith(
        'order-1',
        'provider-1',
      );
      expect(result).toEqual({
        order,
        shipment: { id: 'shipment-1', internalTrackingNumber: 'NW-1' },
      });
      expect(notificationsService.enqueue).not.toHaveBeenCalled();
    });

    it('validates the customer exists before creating anything', async () => {
      customersService.findOne.mockRejectedValue(
        new NotFoundException('Customer x not found'),
      );

      await expect(
        service.createOrderWithShipment('missing-customer'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.order.create).not.toHaveBeenCalled();
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

  describe('updatePayment', () => {
    const paid = { paymentStatus: 'PAID' as const, paidAmount: 1200 };

    it('raises the bill as soon as the payment is recorded', async () => {
      await service.updatePayment('order-1', paid, 'admin-1');

      expect(invoices.generateForOrder).toHaveBeenCalledWith(
        'order-1',
        'admin-1',
      );
    });

    it('does not bill an order that was not marked paid', async () => {
      await service.updatePayment(
        'order-1',
        { paymentStatus: 'PENDING' },
        'admin-1',
      );

      expect(invoices.generateForOrder).not.toHaveBeenCalled();
    });

    // The payment is the fact being recorded. A missing company GSTIN or a failed PDF render is
    // a billing problem, and it must never surface as "recording the payment failed" — the
    // admin's Generate screen is the retry path, and generateForOrder is idempotent.
    it('still records the payment when the invoice cannot be issued', async () => {
      invoices.generateForOrder.mockRejectedValue(
        new Error('Company GSTIN must be set'),
      );

      await expect(
        service.updatePayment('order-1', paid, 'admin-1'),
      ).resolves.toBeDefined();
      expect(prisma.order.update).toHaveBeenCalled();
    });
  });
  // The admin dashboard reports on a date window. Getting the bounds wrong is invisible in the
  // UI -- the chart still draws, it is just missing a day -- so the boundaries are pinned here.
  describe('findAll date window', () => {
    const whereOf = () => prisma.order.findMany.mock.calls[0][0].where;

    it('bounds createdAt to whole UTC days, inclusive of the final day', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ createdFrom: '2026-01-01', createdTo: '2026-01-31' });

      expect(whereOf().createdAt).toEqual({
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-01-31T23:59:59.999Z'),
      });
    });

    it('accepts an open-ended window', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ createdFrom: '2026-01-01' });

      expect(whereOf().createdAt).toEqual({
        gte: new Date('2026-01-01T00:00:00.000Z'),
      });
    });

    it('leaves createdAt unfiltered when no window is given', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({});

      expect(whereOf().createdAt).toBeUndefined();
    });
  });
});
