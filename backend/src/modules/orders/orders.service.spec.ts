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
  const orderWithShipments = {
    ...order,
    shipments: [{ id: 'shipment-1', externalTrackingNumbers: [] }],
    pickupRequest: { pickupLatitude: 17.3995, pickupLongitude: 78.4867 },
  };
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
    companySettings: { findFirst: jest.Mock };
    pickupRequest: { updateMany: jest.Mock };
  };
  let customersService: { findOne: jest.Mock };
  let shipmentsService: { createForOrder: jest.Mock };
  let notificationsService: { enqueue: jest.Mock };
  let invoices: { generateForOrder: jest.Mock; issueCustom: jest.Mock };
  let receipts: { issueAndSendQuietly: jest.Mock };
  let routing: { distanceKm: jest.Mock };
  let coupons: { redeem: jest.Mock };
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
      pickupRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      companySettings: {
        findFirst: jest.fn().mockResolvedValue({
          cancellationBaseFee: 500,
          cancellationPerKmFee: 20,
          // The Hyderabad warehouse, with the pickup fixture ~1.6km away.
          warehouseLatitude: 17.385,
          warehouseLongitude: 78.4867,
        }),
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
      issueCustom: jest.fn().mockResolvedValue({ id: 'inv-2' }),
    };
    receipts = { issueAndSendQuietly: jest.fn().mockResolvedValue(undefined) };
    // The road distance the routing engine would answer with — 2.1km of streets between two
    // points 1.6km apart in a straight line, which is the whole reason roads are measured.
    routing = {
      distanceKm: jest.fn().mockResolvedValue({ km: 2.1, source: 'road' }),
    };

    coupons = {
      redeem: jest.fn().mockResolvedValue({
        id: 'coupon-1',
        code: 'SAVE500',
        discountAmount: 500,
      }),
    };

    service = new OrdersService(
      prisma as never,
      customersService as never,
      shipmentsService as never,
      notificationsService as never,
      invoices as never,
      receipts as never,
      routing as never,
      coupons as never,
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

      await service.findAll({
        createdFrom: '2026-01-01',
        createdTo: '2026-01-31',
      });

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

  // The mapped/unmapped split is the admin's working queue for assigning AWBs, so "unmapped"
  // has to mean *no* shipment carries a number -- `some: { none: ... }` would wrongly list an
  // order the moment any one of its split shipments was still bare.
  describe('findAll AWB filter', () => {
    const whereOf = () => prisma.order.findMany.mock.calls[0][0].where;

    it('matches orders that already carry an AWB', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ awb: 'mapped' });

      expect(whereOf().shipments).toEqual({
        some: { externalTrackingNumbers: { some: {} } },
      });
    });

    it('treats an order with no shipments at all as unmapped', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ awb: 'unmapped' });

      expect(whereOf().shipments).toEqual({
        none: { externalTrackingNumbers: { some: {} } },
      });
    });

    // The bug: a cancelled order can never be given an AWB, so it sat in the "awaiting AWB"
    // queue forever, unactionable, burying the rows that did need work.
    it('drops cancelled orders from the awaiting-AWB queue', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ awb: 'unmapped' });

      expect(whereOf().status).toEqual({ not: 'CANCELLED' });
    });

    it('still shows them when the caller explicitly asks for cancelled', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ awb: 'unmapped', status: 'CANCELLED' as never });

      expect(whereOf().status).toBe('CANCELLED');
    });

    it('leaves the mapped queue alone — a cancelled order can still carry an AWB', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ awb: 'mapped' });

      expect(whereOf().status).toBeUndefined();
    });

    it('keeps a provider filter alongside the unmapped filter', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ awb: 'unmapped', providerId: 'prov-1' });

      expect(whereOf().shipments).toEqual({
        some: { providerId: 'prov-1' },
        none: { externalTrackingNumbers: { some: {} } },
      });
    });

    it.each([
      ['refunded', { refundedAt: { not: null } }],
      ['not-refunded', { refundedAt: null }],
    ])('filters the cancelled view by refund state: %s', async (refund, expected) => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ refund: refund as never });

      expect(whereOf()).toMatchObject(expected);
    });

    it.each([
      ['returned', { returnedAt: { not: null } }],
      ['not-returned', { returnedAt: null }],
    ])('filters by whether the parcel came back: %s', async (returned, expected) => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({ returned: returned as never });

      expect(whereOf()).toMatchObject(expected);
    });

    // Money and goods move independently: refunded-but-not-returned is the state staff chase.
    it('combines the two, because they answer different questions', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({
        refund: 'refunded' as never,
        returned: 'not-returned' as never,
      });

      expect(whereOf()).toMatchObject({
        refundedAt: { not: null },
        returnedAt: null,
      });
    });

    it('leaves shipments unfiltered when no AWB filter is given', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({});

      expect(whereOf().shipments).toBeUndefined();
    });
  });

  describe('cancellation', () => {
    it('charges the base fee plus the per-km rate over the warehouse-to-pickup distance', async () => {
      const quote = await service.quoteCancellation('order-1');

      // 2.1km of road at 20/km, on top of the 500 base.
      expect(quote.distanceKm).toBe(2.1);
      expect(quote.distanceSource).toBe('road');
      expect(quote.totalFee).toBe(542);
      expect(quote.isCancellable).toBe(true);
    });

    it('charges the base fee alone when the pickup address has no coordinates', async () => {
      routing.distanceKm.mockResolvedValue(null);
      prisma.order.findUnique.mockResolvedValue({
        ...orderWithShipments,
        pickupRequest: { pickupLatitude: null, pickupLongitude: null },
      });

      const quote = await service.quoteCancellation('order-1');

      expect(quote.distanceKm).toBeNull();
      expect(quote.distanceSource).toBeNull();
      expect(quote.totalFee).toBe(500);
    });

    it('says so when it had to fall back to the straight line', async () => {
      routing.distanceKm.mockResolvedValue({
        km: 1.6,
        source: 'straight-line',
      });

      const quote = await service.quoteCancellation('order-1');

      expect(quote.distanceSource).toBe('straight-line');
      expect(quote.totalFee).toBe(532);
    });

    it('refuses to cancel once an AWB has been mapped', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...orderWithShipments,
        shipments: [
          {
            id: 'shipment-1',
            externalTrackingNumbers: [{ externalTrackingNumber: 'AWB-1' }],
          },
        ],
      });

      await expect(
        service.cancel('order-1', undefined, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("never cancels another customer's order", async () => {
      await expect(
        service.cancel('order-1', undefined, 'customer-2', 'customer-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('freezes the fee it quoted onto the cancelled order', async () => {
      await service.cancel(
        'order-1',
        'Changed my mind',
        'customer-1',
        'customer-1',
      );

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancellationFee: 542,
            cancellationDistanceKm: 2.1,
            cancellationDistanceSource: 'road',
            cancellationReason: 'Changed my mind',
          }),
        }),
      );
    });
  });

  describe('what a cancellation drags with it', () => {
    it('calls off the pickup, so no partner is sent to a door for nothing', async () => {
      await service.cancel('order-1', 'Not needed', 'customer-1', 'customer-1');

      expect(prisma.pickupRequest.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1', status: { not: 'COMPLETED' } },
        data: { status: 'CANCELLED', rejectionReason: 'Not needed' },
      });
    });

    it('bills the cancellation charge as its own invoice', async () => {
      await service.cancel('order-1', undefined, 'admin-1');

      expect(invoices.issueCustom).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-1',
          grossAmount: 542,
        }),
        'admin-1',
      );
    });

    it('raises no invoice when the cancellation is free', async () => {
      prisma.companySettings.findFirst.mockResolvedValue({
        cancellationBaseFee: 0,
        cancellationPerKmFee: 0,
        warehouseLatitude: null,
        warehouseLongitude: null,
      });

      await service.cancel('order-1', undefined, 'admin-1');

      expect(invoices.issueCustom).not.toHaveBeenCalled();
    });

    it('still cancels when the charge cannot be invoiced', async () => {
      // No GSTIN on file is the normal reason, and it must not strand a customer mid-cancel.
      invoices.issueCustom.mockRejectedValue(
        new Error('company settings incomplete'),
      );

      await expect(
        service.cancel('order-1', undefined, 'admin-1'),
      ).resolves.toBeDefined();
      expect(prisma.order.update).toHaveBeenCalled();
    });
  });
});
