import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OnlinePaymentsService,
  payablePaise,
  resolveWebhookTransition,
} from './online-payments.service';
import { YoupiError, paiseToRupeesString } from './youpi.client';

const observed = {
  event: 'OBSERVED_SUCCESS',
  orderId: 'attempt-1',
  amountPaise: 418650,
  currency: 'INR',
  method: 'UPI',
  utr: '430512876431',
  settlementState: 'NOT_RECONCILED',
};

describe('resolveWebhookTransition', () => {
  it('treats a bank alert as observed, never as paid', () => {
    expect(resolveWebhookTransition(observed, 418650)).toEqual({
      status: 'OBSERVED',
      from: ['CREATED', 'FAILED', 'EXPIRED', 'CANCELLED'],
      note: null,
    });
  });

  it('accepts a late alert on a checkout that had already expired', () => {
    const transition = resolveWebhookTransition(observed, 418650);
    expect(transition?.from).toContain('EXPIRED');
  });

  it('holds an alert for a different amount for a person to look at', () => {
    const transition = resolveWebhookTransition(
      { ...observed, amountPaise: 41865 },
      418650,
    );
    expect(transition?.status).toBe('MANUAL_REVIEW');
    expect(transition?.note).toContain('418.65');
    expect(transition?.note).toContain('4186.50');
  });

  it('only reconciles a UPI session the gateway matched to a statement line', () => {
    const reconciled = {
      ...observed,
      event: 'RECONCILED',
      settlementState: 'RECONCILED',
    };
    expect(resolveWebhookTransition(reconciled, 418650)?.status).toBe(
      'RECONCILED',
    );
    expect(
      resolveWebhookTransition({ ...reconciled, method: 'COD' }, 418650),
    ).toBeNull();
    expect(
      resolveWebhookTransition(
        { ...reconciled, settlementState: 'NOT_RECONCILED' },
        418650,
      ),
    ).toBeNull();
  });

  it('lets an expiry close an open checkout but not undo a reported payment', () => {
    expect(
      resolveWebhookTransition({ ...observed, event: 'EXPIRED' }, 418650),
    ).toEqual({ status: 'EXPIRED', from: ['CREATED'], note: null });
  });

  it('never lists an admin decision as replaceable', () => {
    for (const event of [
      'OBSERVED_SUCCESS',
      'RECONCILED',
      'MANUAL_REVIEW',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
    ]) {
      const transition = resolveWebhookTransition(
        { ...observed, event, settlementState: 'RECONCILED' },
        418650,
      );
      expect(transition?.from).not.toContain('CONFIRMED');
      expect(transition?.from).not.toContain('REJECTED');
    }
  });

  it('ignores the cash-on-delivery SUCCESS event, which this site never opens', () => {
    expect(
      resolveWebhookTransition(
        { ...observed, event: 'SUCCESS', method: 'COD' },
        418650,
      ),
    ).toBeNull();
  });
});

describe('payablePaise', () => {
  const order = { status: 'CONFIRMED', paymentStatus: 'PENDING' };

  it('is the due amount in paise, without float drift', () => {
    expect(payablePaise({ ...order, dueAmount: 4186.5 })).toBe(418650);
    expect(payablePaise({ ...order, dueAmount: 1234.56 })).toBe(123456);
  });

  it('refuses an order that owes nothing, is paid, or is cancelled', () => {
    expect(() => payablePaise({ ...order, dueAmount: null })).toThrow(
      BadRequestException,
    );
    expect(() =>
      payablePaise({ ...order, paymentStatus: 'PAID', dueAmount: 100 }),
    ).toThrow(BadRequestException);
    expect(() =>
      payablePaise({ ...order, status: 'CANCELLED', dueAmount: 100 }),
    ).toThrow(BadRequestException);
  });
});

describe('paiseToRupeesString', () => {
  it('formats exactly two decimals', () => {
    expect(paiseToRupeesString(418650)).toBe('4186.50');
    expect(paiseToRupeesString(5)).toBe('0.05');
    expect(paiseToRupeesString(120000)).toBe('1200.00');
  });
});

describe('OnlinePaymentsService', () => {
  const order = {
    id: 'order-1',
    customerId: 'customer-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    paidAmount: 1000,
    dueAmount: 4186.5,
    shipments: [{ internalTrackingNumber: 'NWL2611000482' }],
  };
  const attempt = {
    id: 'attempt-1',
    orderId: 'order-1',
    customerId: 'customer-1',
    amountPaise: 418650,
    status: 'CREATED',
    gatewayPaymentId: null as string | null,
    checkoutUrl: null as string | null,
    utr: null as string | null,
    createdAt: new Date('2026-11-11T09:30:00Z'),
    updatedAt: new Date('2026-11-11T09:30:00Z'),
  };

  let tx: {
    $executeRaw: jest.Mock;
    onlinePayment: {
      count: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    onlinePaymentEvent: { create: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    onlinePayment: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let orders: {
    findOne: jest.Mock;
    findOneForCustomer: jest.Mock;
    updatePayment: jest.Mock;
  };
  let youpi: {
    isConfigured: jest.Mock;
    createPayment: jest.Mock;
    fetchStatus: jest.Mock;
  };
  let service: OnlinePaymentsService;

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      onlinePayment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(attempt),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      onlinePaymentEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
      onlinePayment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(attempt),
        findUniqueOrThrow: jest.fn().mockResolvedValue(attempt),
        update: jest.fn().mockResolvedValue(attempt),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    orders = {
      findOne: jest.fn().mockResolvedValue(order),
      findOneForCustomer: jest.fn().mockResolvedValue(order),
      updatePayment: jest.fn().mockResolvedValue(order),
    };
    youpi = {
      isConfigured: jest.fn().mockReturnValue(true),
      createPayment: jest.fn().mockResolvedValue({
        paymentId: 'gw-1',
        checkoutUrl: 'https://pay.example.test/checkout/gw-1',
        status: 'INITIATED',
      }),
      fetchStatus: jest.fn().mockResolvedValue('ACTIVE'),
    };
    const config = {
      get: (key: string) =>
        key === 'PUBLIC_FRONTEND_URL' ? 'https://site.example.test' : undefined,
    };
    service = new OnlinePaymentsService(
      prisma as never,
      config as never,
      orders as never,
      youpi as never,
    );
  });

  describe('startCheckout', () => {
    it('charges the due read from the database and returns the checkout page', async () => {
      const result = await service.startCheckout('order-1', 'customer-1');

      expect(orders.findOneForCustomer).toHaveBeenCalledWith(
        'order-1',
        'customer-1',
      );
      expect(youpi.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'attempt-1',
          amountPaise: 418650,
          returnUrl: 'https://site.example.test/orders?payment=order-1',
        }),
      );
      expect(result).toEqual({
        paymentId: 'attempt-1',
        checkoutUrl: 'https://pay.example.test/checkout/gw-1',
      });
    });

    it('is refused while no gateway is configured', async () => {
      youpi.isConfigured.mockReturnValue(false);

      await expect(
        service.startCheckout('order-1', 'customer-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(youpi.createPayment).not.toHaveBeenCalled();
    });

    it('sends the customer back to a checkout that is still open instead of opening a second', async () => {
      const open = {
        ...attempt,
        gatewayPaymentId: 'gw-1',
        checkoutUrl: 'https://pay.example.test/checkout/gw-1',
      };
      prisma.onlinePayment.findMany.mockResolvedValue([open]);

      const result = await service.startCheckout('order-1', 'customer-1');

      expect(result.checkoutUrl).toBe(open.checkoutUrl);
      expect(youpi.createPayment).not.toHaveBeenCalled();
    });

    it('refuses a second payment while one is being confirmed', async () => {
      prisma.onlinePayment.findMany.mockResolvedValue([
        { ...attempt, status: 'OBSERVED' },
      ]);

      await expect(
        service.startCheckout('order-1', 'customer-1'),
      ).rejects.toThrow(ConflictException);
      expect(youpi.createPayment).not.toHaveBeenCalled();
    });

    it('opens a fresh checkout once the gateway says the old one expired', async () => {
      const stale = { ...attempt, id: 'attempt-0', gatewayPaymentId: 'gw-0' };
      prisma.onlinePayment.findMany.mockResolvedValue([stale]);
      youpi.fetchStatus.mockResolvedValue('EXPIRED');
      prisma.onlinePayment.findUniqueOrThrow.mockResolvedValue({
        ...stale,
        status: 'EXPIRED',
      });

      await service.startCheckout('order-1', 'customer-1');

      expect(prisma.onlinePayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'attempt-0', status: 'CREATED' },
        data: { status: 'EXPIRED' },
      });
      expect(youpi.createPayment).toHaveBeenCalled();
    });

    it('records the attempt as failed and says "not right now" when the gateway is paused', async () => {
      youpi.createPayment.mockRejectedValue(
        new YoupiError(
          'UPI observers are offline.',
          503,
          'OBSERVERS_UNHEALTHY',
        ),
      );

      await expect(
        service.startCheckout('order-1', 'customer-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.onlinePayment.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'FAILED', note: 'UPI observers are offline.' },
      });
    });
  });

  describe('applyWebhook', () => {
    it('records the event and moves the attempt, without touching the order', async () => {
      const outcome = await service.applyWebhook('delivery-1', observed);

      expect(outcome).toBe('applied');
      expect(tx.onlinePaymentEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'delivery-1',
          onlinePaymentId: 'attempt-1',
          event: 'OBSERVED_SUCCESS',
        }),
      });
      expect(tx.onlinePayment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'attempt-1',
          status: { in: ['CREATED', 'FAILED', 'EXPIRED', 'CANCELLED'] },
        },
        data: { status: 'OBSERVED', utr: '430512876431' },
      });
      expect(orders.updatePayment).not.toHaveBeenCalled();
    });

    it('drops a redelivery of the same event', async () => {
      tx.onlinePaymentEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.applyWebhook('delivery-1', observed)).resolves.toBe(
        'duplicate',
      );
      expect(tx.onlinePayment.updateMany).not.toHaveBeenCalled();
    });

    it('acknowledges an event for a payment it never opened', async () => {
      prisma.onlinePayment.findUnique.mockResolvedValue(null);

      await expect(service.applyWebhook('delivery-2', observed)).resolves.toBe(
        'ignored',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    const reported = { ...attempt, status: 'OBSERVED', utr: '430512876431' };

    beforeEach(() => {
      prisma.onlinePayment.findUnique.mockResolvedValue(reported);
    });

    it('marks the order paid through the normal payment path, as the confirming admin', async () => {
      await service.confirm('attempt-1', 'admin-1');

      expect(prisma.onlinePayment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'attempt-1',
          status: { in: ['OBSERVED', 'RECONCILED', 'MANUAL_REVIEW'] },
        },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          reviewedByAdminId: 'admin-1',
        }),
      });
      expect(orders.updatePayment).toHaveBeenCalledWith(
        'order-1',
        {
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          // 1000 taken at the door + 4186.50 online.
          paidAmount: 5186.5,
          paymentNote: 'Paid online (YouPI). UTR 430512876431',
        },
        'admin-1',
      );
    });

    it('will not record a second payment on an order that is already paid', async () => {
      orders.findOne.mockResolvedValue({ ...order, paymentStatus: 'PAID' });

      await expect(service.confirm('attempt-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(orders.updatePayment).not.toHaveBeenCalled();
    });

    it('will not clear a due that no longer matches what was paid', async () => {
      orders.findOne.mockResolvedValue({ ...order, dueAmount: 5000 });

      await expect(service.confirm('attempt-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(orders.updatePayment).not.toHaveBeenCalled();
    });

    it('loses to another admin who confirmed first', async () => {
      prisma.onlinePayment.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirm('attempt-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(orders.updatePayment).not.toHaveBeenCalled();
    });

    it('hands the claim back when the order could not be marked paid', async () => {
      orders.updatePayment.mockRejectedValue(new Error('database is down'));

      await expect(service.confirm('attempt-1', 'admin-1')).rejects.toThrow(
        'database is down',
      );
      expect(prisma.onlinePayment.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'OBSERVED', reviewedByAdminId: null, reviewedAt: null },
      });
    });

    it('refuses a checkout the gateway never reported as paid', async () => {
      prisma.onlinePayment.findUnique.mockResolvedValue(attempt);

      await expect(service.confirm('attempt-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
