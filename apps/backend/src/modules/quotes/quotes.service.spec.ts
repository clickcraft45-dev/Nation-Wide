import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuotesService } from './quotes.service';

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

function submissionKeyCollisionError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['submission_key'] },
  });
}

const baseOrigin = {
  name: 'Sender',
  phone: '9876543210',
  addressLine1: '123 Main St',
  city: 'Hyderabad',
  state: 'TG',
  postalCode: '500001',
  country: 'India',
};

const baseDestination = {
  name: 'Receiver',
  phone: '9999999999',
  addressLine1: '456 Oak Ave',
  city: 'Chicago',
  state: 'IL',
  postalCode: '60601',
  country: 'USA',
};

function baseCreateDto(overrides: Record<string, unknown> = {}) {
  return {
    shipmentType: 'PARCEL',
    weightKg: 5,
    origin: baseOrigin,
    destination: baseDestination,
    fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
    submissionKey: 'key-1',
    ...overrides,
  } as never;
}

function pickupDateInWindow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

function computedOption(overrides: Record<string, unknown> = {}) {
  return {
    rateProviderId: 'provider-1',
    rateProviderName: 'E2E Test Provider',
    rateCardId: 'card-1',
    weightSlabId: 'slab-1',
    currency: 'INR',
    baseRate: 500,
    pssAmount: 50,
    fuelChargePercent: 10,
    fuelChargeAmount: 50,
    taxableSubtotal: 600,
    gstPercent: 18,
    gstAmount: 108,
    nationwideCut: 100,
    finalPrice: 808,
    ...overrides,
  };
}

describe('QuotesService', () => {
  const savedQuote = {
    id: 'quote-1',
    customerId: 'customer-1',
    status: 'SUBMITTED',
  };

  let prisma: {
    quote: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    pickup: { create: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let ordersService: { createOrderWithShipment: jest.Mock };
  let notificationsService: { enqueue: jest.Mock };
  let pricingEngineService: { computeQuotesForRequest: jest.Mock };
  let configService: { get: jest.Mock };
  let service: QuotesService;

  beforeEach(() => {
    prisma = {
      quote: {
        create: jest.fn().mockResolvedValue(savedQuote),
        findUnique: jest.fn().mockResolvedValue(savedQuote),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue(savedQuote),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pickup: { create: jest.fn().mockResolvedValue({ id: 'pickup-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    ordersService = {
      createOrderWithShipment: jest.fn().mockResolvedValue({
        order: { id: 'order-1' },
        shipment: {
          id: 'shipment-1',
          internalTrackingNumber: 'NW-26-00000001',
        },
      }),
    };
    notificationsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    pricingEngineService = {
      computeQuotesForRequest: jest.fn().mockResolvedValue([]),
    };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    service = new QuotesService(
      prisma as never,
      ordersService as never,
      notificationsService as never,
      pricingEngineService as never,
      configService as never,
    );
  });

  describe('create — classification (short-circuits before the pricing engine)', () => {
    it('flags OTHER shipment type as NEEDS_MANUAL_REVIEW/MISCELLANEOUS without calling the pricing engine', async () => {
      await service.create(
        baseCreateDto({ shipmentType: 'OTHER' }),
        'customer-1',
      );
      expect(prisma.quote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'NEEDS_MANUAL_REVIEW',
            reviewReason: 'MISCELLANEOUS',
          }),
        }),
      );
      expect(
        pricingEngineService.computeQuotesForRequest,
      ).not.toHaveBeenCalled();
    });

    it('flags weight over the oversized threshold as NEEDS_MANUAL_REVIEW/OVERSIZED without calling the pricing engine', async () => {
      await service.create(baseCreateDto({ weightKg: 150 }), 'customer-1');
      expect(prisma.quote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'NEEDS_MANUAL_REVIEW',
            reviewReason: 'OVERSIZED',
          }),
        }),
      );
      expect(
        pricingEngineService.computeQuotesForRequest,
      ).not.toHaveBeenCalled();
    });
  });

  describe('create — pricing engine wiring', () => {
    it('marks the quote RATED and attaches the computed options when the engine finds eligible providers', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([
        computedOption(),
      ]);

      await service.create(baseCreateDto(), 'customer-1');

      expect(pricingEngineService.computeQuotesForRequest).toHaveBeenCalledWith(
        {
          destinationCountryName: 'USA',
          weightKg: 5,
          shipmentType: 'PARCEL',
        },
      );
      expect(prisma.quote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RATED',
            reviewReason: null,
            rateQuoteOptions: {
              create: [expect.objectContaining({ finalPrice: 808 })],
            },
          }),
        }),
      );
    });

    it('falls back to NEEDS_MANUAL_REVIEW/NO_RATE_AVAILABLE when the engine finds no eligible providers', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([]);

      await service.create(baseCreateDto(), 'customer-1');

      expect(prisma.quote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'NEEDS_MANUAL_REVIEW',
            reviewReason: 'NO_RATE_AVAILABLE',
          }),
        }),
      );
      const callData = prisma.quote.create.mock.calls[0][0].data;
      expect(callData.rateQuoteOptions).toBeUndefined();
    });
  });

  describe('create — pickup window validation', () => {
    it('rejects PICKUP with no pickupDate/pickupTimeSlot', async () => {
      await expect(
        service.create(
          baseCreateDto({ fulfillmentMethod: 'PICKUP' }),
          'customer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a pickupDate more than 7 days out', async () => {
      const tooFar = new Date();
      tooFar.setUTCDate(tooFar.getUTCDate() + 10);
      await expect(
        service.create(
          baseCreateDto({
            fulfillmentMethod: 'PICKUP',
            pickupDate: tooFar.toISOString().slice(0, 10),
            pickupTimeSlot: '09:00-12:00',
          }),
          'customer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a pickupDate in the past', async () => {
      const past = new Date();
      past.setUTCDate(past.getUTCDate() - 1);
      await expect(
        service.create(
          baseCreateDto({
            fulfillmentMethod: 'PICKUP',
            pickupDate: past.toISOString().slice(0, 10),
            pickupTimeSlot: '09:00-12:00',
          }),
          'customer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid pickup window', async () => {
      await service.create(
        baseCreateDto({
          fulfillmentMethod: 'PICKUP',
          pickupDate: pickupDateInWindow(),
          pickupTimeSlot: '09:00-12:00',
        }),
        'customer-1',
      );
      expect(prisma.quote.create).toHaveBeenCalled();
    });

    it('rejects WAREHOUSE_DROP_OFF with a pickupDate set', async () => {
      await expect(
        service.create(
          baseCreateDto({
            fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
            pickupDate: pickupDateInWindow(),
          }),
          'customer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('create — duplicate submission', () => {
    it('returns the existing quote on a submissionKey collision instead of throwing', async () => {
      prisma.quote.create.mockRejectedValueOnce(submissionKeyCollisionError());
      prisma.quote.findUnique.mockResolvedValueOnce(savedQuote);

      const result = await service.create(baseCreateDto(), 'customer-1');

      expect(result).toEqual(savedQuote);
      expect(prisma.quote.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { submissionKey: 'key-1' } }),
      );
    });
  });

  describe('acceptQuote', () => {
    it('rejects when the quote does not belong to the caller', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...savedQuote,
        customerId: 'someone-else',
        status: 'QUOTED',
      });
      await expect(
        service.acceptQuote('quote-1', 'customer-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when the quote is not QUOTED', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...savedQuote,
        status: 'SUBMITTED',
      });
      await expect(
        service.acceptQuote('quote-1', 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the order+shipment, a pickup row, and marks the quote ACCEPTED', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...savedQuote,
        status: 'QUOTED',
        fulfillmentMethod: 'PICKUP',
        pickupDate: new Date('2026-08-01'),
        pickupTimeSlot: '09:00-12:00',
      });

      await service.acceptQuote('quote-1', 'customer-1');

      expect(ordersService.createOrderWithShipment).toHaveBeenCalledWith(
        'customer-1',
      );
      expect(prisma.pickup.create).toHaveBeenCalledWith({
        data: {
          quoteId: 'quote-1',
          orderId: 'order-1',
          method: 'PICKUP',
          scheduledDate: new Date('2026-08-01'),
          scheduledTimeSlot: '09:00-12:00',
        },
      });
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { orderId: 'order-1', status: 'ACCEPTED' },
      });
    });
  });

  describe('selectOption', () => {
    const ratedQuote = {
      ...savedQuote,
      status: 'RATED',
      fulfillmentMethod: 'WAREHOUSE_DROP_OFF',
      pickupDate: null,
      pickupTimeSlot: null,
      optionsExpireAt: new Date(Date.now() + 60 * 60 * 1000),
      rateQuoteOptions: [
        { id: 'option-1', finalPrice: decimal(808), currency: 'INR' },
      ],
    };

    it('rejects when the quote does not belong to the caller', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...ratedQuote,
        customerId: 'someone-else',
      });
      await expect(
        service.selectOption('quote-1', 'option-1', 'customer-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an optionId that does not belong to this quote', async () => {
      prisma.quote.findUnique.mockResolvedValue(ratedQuote);
      await expect(
        service.selectOption('quote-1', 'not-a-real-option', 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the quote is not RATED', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...ratedQuote,
        status: 'QUOTED',
      });
      await expect(
        service.selectOption('quote-1', 'option-1', 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the quote has expired', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...ratedQuote,
        optionsExpireAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      await expect(
        service.selectOption('quote-1', 'option-1', 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the conditional claim loses the race (already transitioned)', async () => {
      prisma.quote.findUnique.mockResolvedValue(ratedQuote);
      prisma.quote.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.selectOption('quote-1', 'option-1', 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('claims the quote, creates the order+pickup, and records the selected option', async () => {
      prisma.quote.findUnique.mockResolvedValue(ratedQuote);

      await service.selectOption('quote-1', 'option-1', 'customer-1');

      expect(prisma.quote.updateMany).toHaveBeenCalledWith({
        where: { id: 'quote-1', status: 'RATED' },
        data: { status: 'ACCEPTED' },
      });
      expect(ordersService.createOrderWithShipment).toHaveBeenCalledWith(
        'customer-1',
      );
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          orderId: 'order-1',
          status: 'ACCEPTED',
          selectedOptionId: 'option-1',
          quotedAmount: decimal(808),
          quotedCurrency: 'INR',
        },
      });
    });
  });

  describe('setManualQuote', () => {
    it('sets the amount, marks QUOTED, audit-logs, and notifies the customer', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...savedQuote,
        status: 'SUBMITTED',
      });

      await service.setManualQuote(
        'quote-1',
        { amount: 1500, currency: 'INR' },
        'actor-1',
      );

      expect(prisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quote-1' },
          data: expect.objectContaining({
            quotedAmount: 1500,
            quotedCurrency: 'INR',
            quotedByAdminId: 'actor-1',
            status: 'QUOTED',
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'actor-1',
            action: 'MANUAL_QUOTE_CREATED',
            entity: 'Quote',
          }),
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'quote_ready',
        { amount: '1500' },
      );
    });

    it('rejects re-quoting an already-ACCEPTED quote', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...savedQuote,
        status: 'ACCEPTED',
      });
      await expect(
        service.setManualQuote('quote-1', { amount: 1500 }, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('marks REJECTED, audit-logs, and notifies the customer', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...savedQuote,
        status: 'NEEDS_MANUAL_REVIEW',
      });

      await service.reject('quote-1', { reason: 'Restricted item' }, 'actor-1');

      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { status: 'REJECTED', rejectionReason: 'Restricted item' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'QUOTE_REJECTED',
            entity: 'Quote',
          }),
        }),
      );
      expect(notificationsService.enqueue).toHaveBeenCalledWith(
        'customer-1',
        'WHATSAPP',
        'quote_rejected',
        { reason: 'Restricted item' },
      );
    });
  });

  describe('findOneAdmin', () => {
    it('throws NotFoundException for an unknown quote', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);
      await expect(service.findOneAdmin('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('preview', () => {
    it('returns RATED with slim, customer-safe options when the engine finds eligible providers', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([
        computedOption(),
      ]);

      const result = await service.preview({
        destinationCountry: 'USA',
        weightKg: 5,
        shipmentType: 'PARCEL',
      });

      expect(pricingEngineService.computeQuotesForRequest).toHaveBeenCalledWith(
        {
          destinationCountryName: 'USA',
          weightKg: 5,
          shipmentType: 'PARCEL',
        },
      );
      expect(result).toEqual({
        status: 'RATED',
        reviewReason: null,
        options: [
          {
            rateProviderId: 'provider-1',
            rateProviderName: 'E2E Test Provider',
            currency: 'INR',
            finalPrice: 808,
          },
        ],
      });
    });

    it('short-circuits to NEEDS_MANUAL_REVIEW/OVERSIZED without calling the pricing engine', async () => {
      const result = await service.preview({
        destinationCountry: 'USA',
        weightKg: 150,
        shipmentType: 'PARCEL',
      });

      expect(result).toEqual({
        status: 'NEEDS_MANUAL_REVIEW',
        reviewReason: 'OVERSIZED',
        options: [],
      });
      expect(
        pricingEngineService.computeQuotesForRequest,
      ).not.toHaveBeenCalled();
    });

    it('short-circuits to NEEDS_MANUAL_REVIEW/MISCELLANEOUS for shipmentType OTHER without calling the pricing engine', async () => {
      // Shares classifyManualReview with create(), so this can never drift from the real
      // POST /quotes classification for the exact same request (a bug the shared helper was
      // extracted specifically to make impossible).
      const result = await service.preview({
        destinationCountry: 'USA',
        weightKg: 5,
        shipmentType: 'OTHER',
      });

      expect(result).toEqual({
        status: 'NEEDS_MANUAL_REVIEW',
        reviewReason: 'MISCELLANEOUS',
        options: [],
      });
      expect(
        pricingEngineService.computeQuotesForRequest,
      ).not.toHaveBeenCalled();
    });

    it('returns NEEDS_MANUAL_REVIEW/NO_RATE_AVAILABLE when the engine finds no eligible providers', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([]);

      const result = await service.preview({
        destinationCountry: 'Freedonia',
        weightKg: 2,
        shipmentType: 'PARCEL',
      });

      expect(result).toEqual({
        status: 'NEEDS_MANUAL_REVIEW',
        reviewReason: 'NO_RATE_AVAILABLE',
        options: [],
      });
    });

    it('never writes to the database', async () => {
      pricingEngineService.computeQuotesForRequest.mockResolvedValue([
        computedOption(),
      ]);

      await service.preview({
        destinationCountry: 'USA',
        weightKg: 5,
        shipmentType: 'PARCEL',
      });

      expect(prisma.quote.create).not.toHaveBeenCalled();
    });
  });
});
