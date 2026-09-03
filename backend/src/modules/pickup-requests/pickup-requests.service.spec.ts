import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PickupRequestsService } from './pickup-requests.service';

function decimalLike(value: number) {
  return value;
}

const baseQuote = {
  id: 'quote-1',
  customerId: 'customer-1',
  status: 'PENDING_PICKUP_REQUEST',
  shipmentType: 'PACKAGE',
  weightKg: decimalLike(5),
  quotedAmount: null,
  quotedCurrency: null,
  destCountry: 'United States',
  selectedOption: {
    rateProviderId: 'provider-1',
    rateProvider: { name: 'FedEx' },
    finalPrice: decimalLike(850),
    currency: 'INR',
  },
};

const basePickupRequest = {
  id: 'pr-1',
  quoteId: 'quote-1',
  customerId: 'customer-1',
  rateProviderId: 'provider-1',
  rateProviderName: 'FedEx',
  status: 'ASSIGNED',
  assignedPartnerId: 'partner-1',
  arrivedAt: new Date(),
  estimatedWeightKg: decimalLike(5),
  estimatedPrice: decimalLike(850),
  currency: 'INR',
  verifiedAt: null,
  verifiedPrice: null,
  paymentCollectedAt: null,
  paymentMethod: null,
  collectedAmount: null,
  quote: { destCity: 'NYC', destState: 'NY', destCountry: 'United States' },
  customer: { name: 'Jane', phone: '+911234567890' },
  assignedPartner: { id: 'partner-1', name: 'Partner One', email: 'p1@nw.dev' },
};

describe('PickupRequestsService', () => {
  let prisma: {
    quote: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    pickupRequest: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    adminUser: { findUnique: jest.Mock; findFirst: jest.Mock };
    order: { update: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let ordersService: { createOrderWithShipment: jest.Mock };
  let pricingEngineService: { computeQuotesForRequest: jest.Mock };
  let notificationsService: { enqueue: jest.Mock };
  let service: PickupRequestsService;

  beforeEach(() => {
    prisma = {
      quote: {
        findUnique: jest.fn().mockResolvedValue(baseQuote),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pickupRequest: {
        create: jest.fn().mockResolvedValue({ id: 'pr-1' }),
        findUnique: jest.fn().mockResolvedValue(basePickupRequest),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      adminUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'partner-1', role: 'PICKUP_PARTNER' }),
        // Defaults to "no active partner yet" so the existing create() tests (which don't care
        // about auto-assignment) see unchanged behavior — see the dedicated auto-assign tests
        // below for the case where this resolves a partner.
        findFirst: jest.fn().mockResolvedValue(null),
      },
      order: { update: jest.fn().mockResolvedValue(undefined) },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      // Supports both the array form ($transaction([...])) and the interactive callback form
      // ($transaction(async (tx) => {...})) — create() uses the latter for its atomic claim.
      $transaction: jest.fn((arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
        }
        return Promise.all(arg as Promise<unknown>[]);
      }),
    };
    ordersService = {
      createOrderWithShipment: jest.fn().mockResolvedValue({
        order: { id: 'order-1' },
        shipment: { internalTrackingNumber: 'NW-26-00000001' },
      }),
    };
    pricingEngineService = {
      computeQuotesForRequest: jest
        .fn()
        .mockResolvedValue([{ rateProviderId: 'provider-1', finalPrice: 970 }]),
    };
    notificationsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new PickupRequestsService(
      prisma as never,
      ordersService as never,
      pricingEngineService as never,
      notificationsService as never,
    );
  });

  describe('create', () => {
    it('throws NotFoundException when the quote does not exist', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ quoteId: 'missing' } as never, 'customer-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the quote belongs to a different customer', async () => {
      await expect(
        service.create({ quoteId: 'quote-1' } as never, 'someone-else'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when the quote is not PENDING_PICKUP_REQUEST', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...baseQuote,
        status: 'RATED',
      });
      await expect(
        service.create({ quoteId: 'quote-1' } as never, 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires pickupDate/pickupTimeSlot unless dropAtWarehouse is true', async () => {
      await expect(
        service.create(
          { quoteId: 'quote-1', dropAtWarehouse: false } as never,
          'customer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the pickup request, snapshots the selected provider, and flips the quote to PICKUP_REQUESTED', async () => {
      await service.create(
        {
          quoteId: 'quote-1',
          dropAtWarehouse: false,
          pickupContactName: 'Jane',
          pickupContactPhone: '+911234567890',
          pickupAddressLine1: '123 Main St',
          pickupCity: 'NYC',
          pickupState: 'NY',
          pickupPostalCode: '10001',
          pickupDate: '2026-08-10',
          pickupTimeSlot: 'MORNING',
        } as never,
        'customer-1',
      );

      expect(prisma.pickupRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rateProviderId: 'provider-1',
            rateProviderName: 'FedEx',
            estimatedPrice: 850,
          }),
        }),
      );
      expect(prisma.quote.updateMany).toHaveBeenCalledWith({
        where: { id: 'quote-1', status: 'PENDING_PICKUP_REQUEST' },
        data: { status: 'PICKUP_REQUESTED' },
      });
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_request_received',
        {},
      );
    });

    it('rejects a double-submission race — the losing concurrent call never creates a second row', async () => {
      // Simulates two concurrent create() calls: the atomic claim (quote.updateMany) only ever
      // succeeds for one caller. This models the loser, whose claim.count comes back 0 because
      // the winner already flipped the quote's status in the database.
      prisma.quote.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.create(
          {
            quoteId: 'quote-1',
            dropAtWarehouse: true,
            pickupContactName: 'Jane',
            pickupContactPhone: '+911234567890',
            pickupAddressLine1: '123 Main St',
            pickupCity: 'NYC',
            pickupState: 'NY',
            pickupPostalCode: '10001',
          },
          'customer-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pickupRequest.create).not.toHaveBeenCalled();
    });

    it('falls back to the manual-quote price when the quote has no selectedOption', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...baseQuote,
        selectedOption: null,
        quotedAmount: decimalLike(500),
        quotedCurrency: 'INR',
      });

      await service.create(
        {
          quoteId: 'quote-1',
          dropAtWarehouse: true,
          pickupContactName: 'Jane',
          pickupContactPhone: '+911234567890',
          pickupAddressLine1: '123 Main St',
          pickupCity: 'NYC',
          pickupState: 'NY',
          pickupPostalCode: '10001',
        },
        'customer-1',
      );

      expect(prisma.pickupRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rateProviderId: null,
            rateProviderName: null,
            estimatedPrice: 500,
          }),
        }),
      );
    });

    it('auto-assigns the one active Pickup Partner instead of leaving it unassigned', async () => {
      prisma.adminUser.findFirst.mockResolvedValue({
        id: 'auto-partner-1',
        role: 'PICKUP_PARTNER',
      });

      await service.create(
        {
          quoteId: 'quote-1',
          dropAtWarehouse: true,
          pickupContactName: 'Jane',
          pickupContactPhone: '+911234567890',
          pickupAddressLine1: '123 Main St',
          pickupCity: 'NYC',
          pickupState: 'NY',
          pickupPostalCode: '10001',
        },
        'customer-1',
      );

      expect(prisma.adminUser.findFirst).toHaveBeenCalledWith({
        where: { role: 'PICKUP_PARTNER', isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedPartnerId: 'auto-partner-1',
            status: 'ASSIGNED',
          }),
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_partner_assigned',
        {},
      );
    });

    it('leaves the pickup request unassigned when no active partner exists', async () => {
      prisma.adminUser.findFirst.mockResolvedValue(null);

      await service.create(
        {
          quoteId: 'quote-1',
          dropAtWarehouse: true,
          pickupContactName: 'Jane',
          pickupContactPhone: '+911234567890',
          pickupAddressLine1: '123 Main St',
          pickupCity: 'NYC',
          pickupState: 'NY',
          pickupPostalCode: '10001',
        },
        'customer-1',
      );

      expect(prisma.pickupRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('assignPartner', () => {
    it('assigns and writes an audit log', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        status: 'PENDING_ASSIGNMENT',
        assignedPartnerId: null,
      });

      await service.assignPartner('pr-1', 'partner-1', 'admin-1');

      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedPartnerId: 'partner-1',
            status: 'ASSIGNED',
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_partner_assigned',
        {},
      );
    });

    it('rejects assigning a partner to a terminal pickup request', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        status: 'COMPLETED',
      });
      await expect(
        service.assignPartner('pr-1', 'partner-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the target account is not a PICKUP_PARTNER', async () => {
      prisma.adminUser.findUnique.mockResolvedValue({ id: 'x', role: 'STAFF' });
      await expect(
        service.assignPartner('pr-1', 'x', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculate', () => {
    it('returns the recalculated price and difference from the pricing engine', async () => {
      const result = await service.recalculate(
        'pr-1',
        { weightKg: 6, shipmentType: 'PACKAGE' } as never,
        'partner-1',
      );
      expect(result).toEqual({
        estimatedPrice: 850,
        recalculatedPrice: 970,
        difference: 120,
        currency: 'INR',
      });
    });

    it('returns null recalculatedPrice/difference when no matching rate is found', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([]);
      const result = await service.recalculate(
        'pr-1',
        { weightKg: 6, shipmentType: 'PACKAGE' } as never,
        'partner-1',
      );
      expect(result.recalculatedPrice).toBeNull();
      expect(result.difference).toBeNull();
    });

    it('throws NotFoundException when the pickup request is not assigned to this partner', async () => {
      await expect(
        service.recalculate(
          'pr-1',
          { weightKg: 6, shipmentType: 'PACKAGE' } as never,
          'someone-else',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markArrived', () => {
    const notYetArrived = { ...basePickupRequest, arrivedAt: null };

    it('claims the row, sets arrivedAt, moves to OUT_FOR_PICKUP, and writes an audit log', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue(notYetArrived);
      await service.markArrived('pr-1', 'partner-1');

      expect(prisma.pickupRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'pr-1', arrivedAt: null },
        data: { arrivedAt: expect.any(Date), status: 'OUT_FOR_PICKUP' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PICKUP_REQUEST_ARRIVED',
            entity: 'PickupRequest',
            entityId: 'pr-1',
          }),
        }),
      );
    });

    it('is idempotent on retry — a lost claim (count 0) returns the current state without erroring or re-logging', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue(basePickupRequest); // already arrivedAt-set
      prisma.pickupRequest.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markArrived('pr-1', 'partner-1');

      expect(result).toBe(basePickupRequest);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('short-circuits without attempting a claim when arrivedAt is already set on the read', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue(basePickupRequest);
      await service.markArrived('pr-1', 'partner-1');
      expect(prisma.pickupRequest.updateMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a terminal-status pickup request', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...notYetArrived,
        status: 'COMPLETED',
      });
      await expect(service.markArrived('pr-1', 'partner-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the pickup request is not assigned to this partner', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue(notYetArrived);
      await expect(service.markArrived('pr-1', 'someone-else')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verify', () => {
    it('throws BadRequestException when arrival has not been marked yet', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        arrivedAt: null,
      });
      await expect(
        service.verify(
          'pr-1',
          { verifiedWeightKg: 6, verifiedShipmentType: 'PACKAGE' } as never,
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists the verified weight/price and moves to VERIFICATION_PENDING', async () => {
      await service.verify(
        'pr-1',
        { verifiedWeightKg: 6, verifiedShipmentType: 'PACKAGE' } as never,
        'partner-1',
      );
      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verifiedWeightKg: 6,
            verifiedPrice: 970,
            status: 'VERIFICATION_PENDING',
          }),
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_verification_complete',
        { verifiedPrice: '970' },
      );
    });

    it('throws when no rate is available for the corrected weight (never fabricates a price)', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([]);
      await expect(
        service.verify(
          'pr-1',
          { verifiedWeightKg: 999, verifiedShipmentType: 'PACKAGE' } as never,
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('keeps the estimated price for the manual-quote path (no rateProviderId to reprice against)', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        rateProviderId: null,
      });
      await service.verify(
        'pr-1',
        { verifiedWeightKg: 6, verifiedShipmentType: 'PACKAGE' } as never,
        'partner-1',
      );
      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verifiedPrice: 850 }),
        }),
      );
    });

    // An unpriced quote (no rate card covered it) now reaches a partner instead of waiting on
    // manual review, so the partner is the first person to name a price. estimatedPrice is 0
    // there — without this the customer would be asked to pay nothing.
    it('takes the price the partner set when there is no rate to compute from', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        rateProviderId: null,
        estimatedPrice: decimalLike(0),
      });

      await service.verify(
        'pr-1',
        {
          verifiedWeightKg: 6,
          verifiedShipmentType: 'PACKAGE',
          verifiedPrice: 1250,
        } as never,
        'partner-1',
      );

      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verifiedPrice: 1250 }),
        }),
      );
    });

    // Otherwise whoever holds the partner's phone could charge what they like and have the
    // system record it as the tariff.
    it('refuses a partner-set price on a rate-carded pickup', async () => {
      await expect(
        service.verify(
          'pr-1',
          {
            verifiedWeightKg: 6,
            verifiedShipmentType: 'PACKAGE',
            verifiedPrice: 1,
          } as never,
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pickupRequest.update).not.toHaveBeenCalled();
    });

    it('rejects verifying a terminal pickup request', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        status: 'REJECTED',
      });
      await expect(
        service.verify(
          'pr-1',
          { verifiedWeightKg: 6, verifiedShipmentType: 'PACKAGE' } as never,
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('collectPayment', () => {
    it('rejects collecting payment before verification', async () => {
      await expect(
        service.collectPayment(
          'pr-1',
          { paymentMethod: 'CASH', collectedAmount: 970 } as never,
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists payment details once verified', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        verifiedAt: new Date(),
        verifiedPrice: decimalLike(970),
      });
      await service.collectPayment(
        'pr-1',
        {
          paymentMethod: 'UPI',
          collectedAmount: 970,
          paymentReference: 'UPI123',
        } as never,
        'partner-1',
      );
      expect(prisma.pickupRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentMethod: 'UPI',
            collectedAmount: 970,
            paymentReference: 'UPI123',
          }),
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'payment_collected',
        { amount: '970' },
      );
    });

    it('rejects a double-collection race — the losing concurrent call records nothing', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        verifiedAt: new Date(),
        verifiedPrice: decimalLike(970),
      });
      // Simulates the loser of two concurrent collect-payment calls: the atomic claim
      // (paymentCollectedAt: null guard) already lost to the other request.
      prisma.pickupRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.collectPayment(
          'pr-1',
          { paymentMethod: 'CASH', collectedAmount: 970 } as never,
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(notificationsService.enqueue).not.toHaveBeenCalled();
    });

    it('rejects a collected amount far below the verified price (BIZ-2 fix)', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        verifiedAt: new Date(),
        verifiedPrice: decimalLike(1000),
      });

      // 1000 - 400 = 600 deviation, far past both the 5% ratio and the ₹50 floor.
      await expect(
        service.collectPayment(
          'pr-1',
          { paymentMethod: 'CASH', collectedAmount: 400 },
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pickupRequest.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a collected amount far above the verified price too', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        verifiedAt: new Date(),
        verifiedPrice: decimalLike(1000),
      });

      await expect(
        service.collectPayment(
          'pr-1',
          { paymentMethod: 'CASH', collectedAmount: 1600 },
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a collected amount within tolerance of the verified price', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        verifiedAt: new Date(),
        verifiedPrice: decimalLike(1000),
      });

      // 1000 * 5% = 50 tolerance — 1030 is a plausible rounding/cash-denomination difference.
      await service.collectPayment(
        'pr-1',
        { paymentMethod: 'CASH', collectedAmount: 1030 },
        'partner-1',
      );
      expect(prisma.pickupRequest.updateMany).toHaveBeenCalled();
    });

    it('falls back to estimatedPrice for tolerance when verifiedPrice is not set', async () => {
      // The manual-quote path (no RateProvider) never re-prices at verification, so
      // verifiedPrice can legitimately stay null — estimatedPrice is the expected figure then.
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        verifiedAt: new Date(),
        verifiedPrice: null,
      });

      await expect(
        service.collectPayment(
          'pr-1',
          { paymentMethod: 'CASH', collectedAmount: 200 },
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptParcel', () => {
    const verifiedAndPaid = {
      ...basePickupRequest,
      verifiedAt: new Date(),
      verifiedPrice: decimalLike(970),
      paymentCollectedAt: new Date(),
      paymentMethod: 'UPI',
      collectedAmount: decimalLike(970),
    };
    const acceptDto = {
      parcelPackedProperly: true,
      weightVerifiedFlag: true,
      restrictedItemsChecked: true,
      documentsVerified: true,
      isFragile: false,
      insuranceRequired: false,
    };

    it('rejects accepting before verification', async () => {
      await expect(
        service.acceptParcel('pr-1', acceptDto as never, 'partner-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects accepting before payment is collected', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        verifiedAt: new Date(),
      });
      await expect(
        service.acceptParcel('pr-1', acceptDto as never, 'partner-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('generates the Order/Shipment only once verified + paid, and marks the pickup request COMPLETED', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue(verifiedAndPaid);

      await service.acceptParcel('pr-1', acceptDto, 'partner-1');

      expect(ordersService.createOrderWithShipment).toHaveBeenCalledWith(
        'customer-1',
      );
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { status: 'ACCEPTED', orderId: 'order-1' },
      });
      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            orderId: 'order-1',
          }),
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'order_created_from_pickup',
        { trackingNumber: 'NW-26-00000001' },
      );
    });

    it('rejects accepting a terminal pickup request', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...verifiedAndPaid,
        status: 'COMPLETED',
      });
      await expect(
        service.acceptParcel('pr-1', acceptDto as never, 'partner-1'),
      ).rejects.toThrow(BadRequestException);
      expect(ordersService.createOrderWithShipment).not.toHaveBeenCalled();
    });

    it('rejects a double-accept race — the losing concurrent call never creates a second Order', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue(verifiedAndPaid);
      // Simulates the loser of two concurrent accept() calls: the atomic claim already lost to
      // the other request, which flipped the row to COMPLETED first.
      prisma.pickupRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.acceptParcel('pr-1', acceptDto as never, 'partner-1'),
      ).rejects.toThrow(BadRequestException);
      expect(ordersService.createOrderWithShipment).not.toHaveBeenCalled();
    });
  });

  describe('rejectParcel', () => {
    it('rejects the pickup request and quote together with a reason', async () => {
      await service.rejectParcel(
        'pr-1',
        { reason: 'Parcel damaged' },
        'partner-1',
      );

      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'REJECTED', rejectionReason: 'Parcel damaged' },
        }),
      );
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { status: 'REJECTED', rejectionReason: 'Parcel damaged' },
      });
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_rejected',
        { reason: 'Parcel damaged' },
      );
    });

    it('rejects rejecting an already-terminal pickup request', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        status: 'CANCELLED',
      });
      await expect(
        service.rejectParcel('pr-1', { reason: 'x' }, 'partner-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDashboardSummary', () => {
    it('aggregates cash vs UPI collected today from payment rows', async () => {
      prisma.pickupRequest.findMany.mockResolvedValue([
        { paymentMethod: 'CASH', collectedAmount: decimalLike(300) },
        { paymentMethod: 'UPI', collectedAmount: decimalLike(200) },
        { paymentMethod: 'CASH', collectedAmount: decimalLike(100) },
      ]);
      prisma.pickupRequest.count
        .mockResolvedValueOnce(3) // todayPickups
        .mockResolvedValueOnce(2) // tomorrowPickups
        .mockResolvedValueOnce(5) // pendingPickups
        .mockResolvedValueOnce(1); // completedToday

      const summary = await service.getDashboardSummary('partner-1');

      expect(summary).toEqual({
        todayPickups: 3,
        tomorrowPickups: 2,
        pendingPickups: 5,
        completedToday: 1,
        collectionsToday: 3,
        cashCollectedToday: 400,
        upiCollectedToday: 200,
        totalStops: 5,
      });
    });
  });
});
