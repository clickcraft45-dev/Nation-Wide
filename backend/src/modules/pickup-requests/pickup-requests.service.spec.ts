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
  parcelPhotoKey: 'pickups/pr-1/parcel.jpg',
  customer: {
    name: 'Jane',
    phone: '+911234567890',
    aadhaarKey: 'kyc/aadhaar/customer-1/a.jpg',
  },
  assignedPartner: { id: 'partner-1', name: 'Partner One', email: 'p1@nw.dev' },
};

const VERIFY_DTO = {
  packages: [{ weightKg: 6 }],
  items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
  verifiedShipmentType: 'PACKAGE',
} as never;

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
    adminUser: { findUnique: jest.Mock; findMany: jest.Mock };
    customer: { findUnique: jest.Mock; update: jest.Mock };
    order: { update: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let ordersService: { createOrderWithShipment: jest.Mock };
  let pricingEngineService: { computeQuotesForRequest: jest.Mock };
  let notificationsService: { enqueue: jest.Mock };
  let invoicesService: { generateForOrder: jest.Mock };
  let receiptsService: { issueAndSendQuietly: jest.Mock };
  let pushService: { sendToAdminUser: jest.Mock };
  let addressBook: { remember: jest.Mock };
  let quotesService: { create: jest.Mock };
  let storage: { put: jest.Mock; delete: jest.Mock };
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
        findMany: jest.fn().mockResolvedValue([]),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1' }),
        update: jest.fn().mockResolvedValue(undefined),
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
    invoicesService = {
      generateForOrder: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    };
    receiptsService = {
      issueAndSendQuietly: jest.fn().mockResolvedValue(undefined),
    };
    pushService = { sendToAdminUser: jest.fn().mockResolvedValue(undefined) };
    addressBook = { remember: jest.fn().mockResolvedValue(undefined) };
    quotesService = { create: jest.fn() };
    storage = {
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new PickupRequestsService(
      prisma as never,
      ordersService as never,
      pricingEngineService as never,
      notificationsService as never,
      invoicesService as never,
      receiptsService as never,
      pushService as never,
      addressBook as never,
      quotesService as never,
      storage as never,
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
          items: [{ description: 'Books', quantity: 2, unitValue: 300 }],
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
      // The contents land on the quote and in the customer's saved-items library.
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          items: [
            {
              category: null,
              description: 'Books',
              quantity: 2,
              unitValue: 300,
              hsCode: null,
            },
          ],
        },
      });
      expect(addressBook.remember).toHaveBeenCalledWith('customer-1', [
        { description: 'Books', quantity: 2, unitValue: 300 },
      ]);
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
            items: [{ description: 'Books', quantity: 2, unitValue: 300 }],
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
          items: [{ description: 'Books', quantity: 2, unitValue: 300 }],
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

    it('broadcasts to every active partner and leaves the request unassigned', async () => {
      prisma.adminUser.findMany.mockResolvedValue([
        { id: 'partner-1' },
        { id: 'partner-2' },
      ]);

      await service.create(
        {
          quoteId: 'quote-1',
          dropAtWarehouse: false,
          pickupContactName: 'Jane',
          pickupContactPhone: '+911234567890',
          items: [{ description: 'Books', quantity: 2, unitValue: 300 }],
          pickupAddressLine1: '123 Main St',
          pickupCity: 'NYC',
          pickupState: 'NY',
          pickupPostalCode: '10001',
          pickupDate: '2026-08-10',
          pickupTimeSlot: 'MORNING',
        } as never,
        'customer-1',
      );

      expect(pushService.sendToAdminUser).toHaveBeenCalledTimes(2);
      expect(prisma.pickupRequest.update).not.toHaveBeenCalled();
      expect(notificationsService.enqueue).not.toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_partner_assigned',
        {},
      );
    });
  });

  describe('warehouse drop-offs', () => {
    it('are not broadcast to partners', async () => {
      prisma.adminUser.findMany.mockResolvedValue([{ id: 'partner-1' }]);
      await service.create(
        {
          quoteId: 'quote-1',
          dropAtWarehouse: true,
          pickupContactName: 'Jane',
          pickupContactPhone: '+911234567890',
          items: [{ description: 'Books', quantity: 2, unitValue: 300 }],
        },
        'customer-1',
      );
      expect(pushService.sendToAdminUser).not.toHaveBeenCalled();
    });

    it('can be worked by admin, but a partner pickup cannot', async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        assignedPartnerId: null,
        dropAtWarehouse: true,
      });
      await expect(
        service.findOneForPartner('pr-1', 'admin-1', true),
      ).resolves.toMatchObject({ id: 'pr-1' });

      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        dropAtWarehouse: false,
      });
      await expect(
        service.findOneForPartner('pr-1', 'admin-1', true),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createForAdmin', () => {
    const recipient = (name: string) => ({
      name,
      phone: '+15550000000',
      addressLine1: '1 Main St',
      city: 'NYC',
      state: 'NY',
      postalCode: '10001',
    });
    const adminDto = {
      customerId: 'customer-1',
      submissionKey: 'key-1',
      partnerId: 'partner-1',
      pickup: {
        pickupContactName: 'Jane',
        pickupContactPhone: '+911234567890',
        pickupAddressLine1: 'Flat 4, MG Road',
        pickupCity: 'Hyderabad',
        pickupState: 'Telangana',
        pickupPostalCode: '500001',
        pickupLatitude: 17.4,
        pickupLongitude: 78.5,
        pickupDate: '2026-09-18',
        pickupTimeSlot: '09:00-12:00',
      },
      orders: [
        {
          recipient: recipient('Sam'),
          destinationCountry: 'United States',
          shipmentType: 'PACKAGE',
          packages: [{ weightKg: 4 }],
          items: [
            {
              category: 'Garments',
              description: 'Saree',
              quantity: 2,
              unitValue: 300,
            },
          ],
        },
      ],
    };
    const ratedQuote = {
      id: 'quote-9',
      status: 'RATED',
      weightKg: 4,
      rateQuoteOptions: [
        {
          id: 'opt-1',
          rateProviderId: 'provider-1',
          rateProvider: { name: 'FedEx' },
          finalPrice: 900,
          currency: 'INR',
        },
      ],
    };

    beforeEach(() => {
      quotesService.create.mockResolvedValue(ratedQuote);
      prisma.adminUser.findUnique.mockResolvedValue({
        id: 'partner-1',
        role: 'PICKUP_PARTNER',
        isActive: true,
      });
      prisma.pickupRequest.create.mockResolvedValue(basePickupRequest);
    });

    it('books each delivery address against one pickup and assigns the partner, without a broadcast', async () => {
      const results = await service.createForAdmin(
        {
          ...adminDto,
          orders: [
            { ...adminDto.orders[0], rateProviderId: 'provider-1' },
            {
              ...adminDto.orders[0],
              recipient: recipient('Ana'),
              destinationCountry: 'Germany',
            },
          ],
        } as never,
        'admin-1',
      );

      expect(results.map((r) => r.status)).toEqual(['BOOKED', 'BOOKED']);
      expect(prisma.pickupRequest.create).toHaveBeenCalledTimes(2);
      for (const call of prisma.pickupRequest.create.mock.calls) {
        const { data } = call[0] as { data: Record<string, unknown> };
        // One collection for the whole booking, handed to the chosen partner.
        expect(data).toEqual(
          expect.objectContaining({
            pickupCity: 'Hyderabad',
            assignedPartnerId: 'partner-1',
            status: 'ASSIGNED',
          }),
        );
      }
      // The assigned partner hears about it; nobody else is offered the job.
      expect(prisma.adminUser.findMany).not.toHaveBeenCalled();
      expect(pushService.sendToAdminUser).toHaveBeenCalledTimes(2);
    });

    it('keeps the contents, including their type, against each address', async () => {
      await service.createForAdmin(adminDto as never, 'admin-1');

      expect(prisma.quote.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            destName: 'Sam',
            items: [
              {
                category: 'Garments',
                description: 'Saree',
                quantity: 2,
                unitValue: 300,
                hsCode: null,
              },
            ],
          }),
        }),
      );
      expect(addressBook.remember).toHaveBeenCalledWith(
        'customer-1',
        adminDto.orders[0].items,
      );
    });

    it('books an unrated shipment on a staff-entered price', async () => {
      quotesService.create.mockResolvedValue({
        ...ratedQuote,
        status: 'NEEDS_MANUAL_REVIEW',
        rateQuoteOptions: [],
      });

      const results = await service.createForAdmin(
        {
          ...adminDto,
          orders: [{ ...adminDto.orders[0], manualPrice: 1500 }],
        } as never,
        'admin-1',
      );

      expect(results[0].status).toBe('BOOKED');
      expect(prisma.pickupRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rateProviderId: null,
            estimatedPrice: 1500,
          }),
        }),
      );
    });

    it('leaves an unrated shipment for staff to price when no price was given', async () => {
      quotesService.create.mockResolvedValue({
        ...ratedQuote,
        status: 'NEEDS_MANUAL_REVIEW',
        rateQuoteOptions: [],
      });

      const results = await service.createForAdmin(
        adminDto as never,
        'admin-1',
      );

      expect(results[0]).toMatchObject({
        status: 'NEEDS_PRICING',
        pickupRequestId: null,
      });
      expect(prisma.pickupRequest.create).not.toHaveBeenCalled();
    });

    it('refuses a carrier that did not quote the shipment', async () => {
      await expect(
        service.createForAdmin(
          {
            ...adminDto,
            orders: [{ ...adminDto.orders[0], rateProviderId: 'provider-x' }],
          } as never,
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pickupRequest.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown or inactive partner before creating anything', async () => {
      prisma.adminUser.findUnique.mockResolvedValue({
        id: 'partner-1',
        role: 'PICKUP_PARTNER',
        isActive: false,
      });
      await expect(
        service.createForAdmin(adminDto as never, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
      expect(quotesService.create).not.toHaveBeenCalled();
    });

    it('returns the existing pickup on a retried submit', async () => {
      quotesService.create.mockResolvedValue({
        ...ratedQuote,
        status: 'PICKUP_REQUESTED',
      });
      await service.createForAdmin(adminDto as never, 'admin-1');
      expect(prisma.pickupRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('saveAadhaar', () => {
    const photo = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as never;

    it('replaces the customer photo and deletes the old one', async () => {
      await service.saveAadhaar('pr-1', photo, 'partner-1');
      expect(storage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^kyc\/aadhaar\/customer-1\/.+\.jpg$/),
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(storage.delete).toHaveBeenCalledWith(
        'kyc/aadhaar/customer-1/a.jpg',
      );
    });

    it("is refused on a pickup that is not this partner's", async () => {
      await expect(
        service.saveAadhaar('pr-1', photo, 'someone-else'),
      ).rejects.toThrow(NotFoundException);
      expect(storage.put).not.toHaveBeenCalled();
    });
  });

  describe('claim', () => {
    it('assigns the claiming partner and WhatsApps the customer', async () => {
      await service.claim('pr-1', 'partner-1');

      expect(prisma.pickupRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'pr-1',
            status: 'PENDING_ASSIGNMENT',
            assignedPartnerId: null,
            dropAtWarehouse: false,
          },
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'pickup_partner_assigned',
        {},
      );
    });

    it('rejects the partner who loses the race', async () => {
      prisma.pickupRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.claim('pr-1', 'partner-2')).rejects.toThrow(
        BadRequestException,
      );
      expect(notificationsService.enqueue).not.toHaveBeenCalled();
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
          {
            packages: [{ weightKg: 6 }],
            items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
            verifiedShipmentType: 'PACKAGE',
          } as never,
          'partner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists the verified weight/price and moves to VERIFICATION_PENDING', async () => {
      await service.verify(
        'pr-1',
        {
          packages: [{ weightKg: 6 }],
          items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
          verifiedShipmentType: 'PACKAGE',
        } as never,
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

    it('prices the volumetric weight when the box is bigger than it is heavy', async () => {
      await service.verify(
        'pr-1',
        {
          // 50x40x30 / 5000 = 12 kg volumetric, against 5 kg on the scale.
          packages: [{ weightKg: 5, lengthCm: 50, widthCm: 40, heightCm: 30 }],
          items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
          verifiedShipmentType: 'PACKAGE',
        } as never,
        'partner-1',
      );
      expect(pricingEngineService.computeQuotesForRequest).toHaveBeenCalledWith(
        expect.objectContaining({ weightKg: 12 }),
      );
      expect(prisma.pickupRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verifiedWeightKg: 12 }),
        }),
      );
    });

    it("refuses to verify until the customer's Aadhaar and a parcel photo are on file", async () => {
      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        customer: { ...basePickupRequest.customer, aadhaarKey: null },
      });
      await expect(
        service.verify('pr-1', VERIFY_DTO, 'partner-1'),
      ).rejects.toThrow(/Aadhaar/);

      prisma.pickupRequest.findUnique.mockResolvedValue({
        ...basePickupRequest,
        parcelPhotoKey: null,
      });
      await expect(
        service.verify('pr-1', VERIFY_DTO, 'partner-1'),
      ).rejects.toThrow(/photo/);
      expect(prisma.pickupRequest.update).not.toHaveBeenCalled();
    });

    it('throws when no rate is available for the corrected weight (never fabricates a price)', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([]);
      await expect(
        service.verify(
          'pr-1',
          {
            packages: [{ weightKg: 999 }],
            items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
            verifiedShipmentType: 'PACKAGE',
          } as never,
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
        {
          packages: [{ weightKg: 6 }],
          items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
          verifiedShipmentType: 'PACKAGE',
        } as never,
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
          packages: [{ weightKg: 6 }],
          items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
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
            packages: [{ weightKg: 6 }],
            items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
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
          {
            packages: [{ weightKg: 6 }],
            items: [{ description: 'Books', quantity: 1, unitValue: 300 }],
            verifiedShipmentType: 'PACKAGE',
          } as never,
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
