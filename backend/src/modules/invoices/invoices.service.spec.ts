import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

const COMPLETE_SETTINGS = {
  gstin: '36AABCU9603R1ZM',
  legalName: 'NationWide Logistics Pvt Ltd',
  address: 'Plot 4, Hitech City, Hyderabad',
  stateName: 'Telangana',
  stateCode: '36',
  sacCode: '996812',
  supportEmail: 'billing@nationwidelogistics.co',
  supportPhone: '+914012345678',
  logoPath: null,
};

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    customerId: 'cust-1',
    status: 'COMPLETED',
    paidAmount: 808,
    customer: {
      id: 'cust-1',
      name: 'Ravi Kumar',
      phone: '+919876500000',
      gstin: null,
      address: 'Banjara Hills, Hyderabad',
    },
    quote: {
      destCity: 'Dubai',
      destCountry: 'United Arab Emirates',
      originState: 'Telangana',
      weightKg: 2,
      quotedAmount: null,
      selectedOption: {
        taxableSubtotal: 600,
        gstAmount: 108,
        nationwideCut: 100,
        finalPrice: 808,
      },
    },
    pickupRequest: null,
    shipments: [
      {
        internalTrackingNumber: 'NW-26-000123',
        provider: { name: 'ICL' },
      },
    ],
    ...overrides,
  };
}

describe('InvoicesService', () => {
  let prisma: {
    invoice: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    order: { findUnique: jest.Mock; findMany: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRawUnsafe: jest.Mock;
  };
  let companySettings: { get: jest.Mock };
  let invoicePdf: { render: jest.Mock };
  let notifications: { enqueue: jest.Mock };
  let storage: { put: jest.Mock; get: jest.Mock };
  let config: { getOrThrow: jest.Mock };
  let service: InvoicesService;

  beforeEach(() => {
    prisma = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'inv-1', ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'inv-1', ...COMPLETE_SETTINGS, ...data }),
          ),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue(makeOrder()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // The invoice-number counter.
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 42 }]),
    };
    companySettings = { get: jest.fn().mockResolvedValue(COMPLETE_SETTINGS) };
    invoicePdf = { render: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
    notifications = { enqueue: jest.fn().mockResolvedValue('notif-1') };
    // S3 is the only real side effect these tests don't want; the PDF renderer is already mocked.
    storage = {
      put: jest.fn().mockResolvedValue({ key: 'k', size: 3 }),
      get: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'PUBLIC_BASE_URL'
          ? 'https://api.nationwidelogistics.co'
          : 'a-signing-secret-at-least-16-chars',
      ),
    };

    service = new InvoicesService(
      prisma as never,
      config as never,
      companySettings as never,
      invoicePdf as never,
      notifications as never,
      storage as never,
    );
  });

  describe('issuing', () => {
    it('refuses to issue when the company GST identity is incomplete', async () => {
      companySettings.get.mockResolvedValue({
        ...COMPLETE_SETTINGS,
        gstin: null,
        stateCode: null,
      });

      await expect(
        service.generateForOrder('order-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      // Critically, no number was consumed and nothing was written.
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('snapshots supplier and recipient rather than leaving them to be joined later', async () => {
      await service.generateForOrder('order-1', 'admin-1');

      const data = prisma.invoice.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(data).toMatchObject({
        supplierGstin: '36AABCU9603R1ZM',
        supplierStateCode: '36',
        recipientName: 'Ravi Kumar',
        recipientGstin: null,
        sacCode: '996812',
      });
    });

    it('numbers the invoice per financial year', async () => {
      await service.generateForOrder('order-1', 'admin-1');

      const counterName = prisma.$queryRawUnsafe.mock.calls[0][1] as string;
      expect(counterName).toMatch(/^invoice:\d{4}-\d{2}$/);

      const data = prisma.invoice.create.mock.calls[0][0].data as {
        invoiceNumber: string;
        sequenceNumber: number;
      };
      expect(data.sequenceNumber).toBe(42);
      expect(data.invoiceNumber).toMatch(/^NW\/\d{4}-\d{2}\/00042$/);
    });

    it('treats a Telangana pickup by a Telangana supplier as intra-state (CGST+SGST)', async () => {
      await service.generateForOrder('order-1', 'admin-1');

      const data = prisma.invoice.create.mock.calls[0][0].data as Record<
        string,
        number
      >;
      expect(data.cgstAmount).toBe(54);
      expect(data.sgstAmount).toBe(54);
      expect(data.igstAmount).toBe(0);
    });

    it('treats an out-of-state pickup as inter-state (IGST)', async () => {
      prisma.order.findUnique.mockResolvedValue(
        makeOrder({
          pickupRequest: {
            pickupState: 'Karnataka',
            verifiedTaxableSubtotal: null,
            verifiedGstAmount: null,
            verifiedNationwideCut: null,
            verifiedPrice: null,
            verifiedWeightKg: null,
            estimatedWeightKg: 2,
          },
        }),
      );

      await service.generateForOrder('order-1', 'admin-1');

      const data = prisma.invoice.create.mock.calls[0][0].data as Record<
        string,
        number | string
      >;
      expect(data.placeOfSupplyCode).toBe('29');
      expect(data.igstAmount).toBe(108);
      expect(data.cgstAmount).toBe(0);
    });

    it('keeps the NationWide Cut out of the taxable value', async () => {
      await service.generateForOrder('order-1', 'admin-1');

      const data = prisma.invoice.create.mock.calls[0][0].data as Record<
        string,
        number
      >;
      expect(data.taxableValue).toBe(600);
      expect(data.nonTaxableCharges).toBe(100);
      expect(data.totalAmount).toBe(808);
    });

    it('is idempotent — an order that already has an invoice returns it untouched', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-existing',
        invoiceNumber: 'NW/2026-27/00001',
      });

      const result = await service.generateForOrder('order-1', 'admin-1');

      expect(result).toMatchObject({ id: 'inv-existing' });
      expect(prisma.invoice.create).not.toHaveBeenCalled();
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('never invoices a cancelled order', async () => {
      prisma.order.findUnique.mockResolvedValue(
        makeOrder({ status: 'CANCELLED' }),
      );
      await expect(
        service.generateForOrder('order-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateForRange', () => {
    it('reports per-order failures instead of abandoning the whole batch', async () => {
      prisma.order.findMany.mockResolvedValue([
        makeOrder({ id: 'order-ok' }),
        // No quote, no pickup request and no payment: nothing to price an invoice from.
        makeOrder({
          id: 'order-unpriced',
          quote: null,
          pickupRequest: null,
          paidAmount: null,
        }),
      ]);

      const summary = await service.generateForRange(
        ['cust-1'],
        new Date('2026-08-01'),
        new Date('2026-08-31'),
        'admin-1',
      );

      expect(summary.created).toHaveLength(1);
      expect(summary.failed).toHaveLength(1);
      expect(summary.failed[0].orderId).toBe('order-unpriced');
    });

    it('rejects an inverted date range rather than silently returning nothing', async () => {
      await expect(
        service.generateForRange(
          ['cust-1'],
          new Date('2026-08-31'),
          new Date('2026-08-01'),
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('public link signing', () => {
    it('accepts the signature it generates and rejects anything else', () => {
      const token = service.signatureFor('inv-1');
      expect(service.verifySignature('inv-1', token)).toBe(true);
      expect(service.verifySignature('inv-2', token)).toBe(false);
      // A wrong-length token must return false, not throw — timingSafeEqual throws on a length
      // mismatch, which would turn a malformed URL into a 500.
      expect(service.verifySignature('inv-1', 'short')).toBe(false);
      expect(service.verifySignature('inv-1', '')).toBe(false);
    });
  });

  describe('cancelling', () => {
    it('cancels in place, keeping the number consumed', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'ISSUED',
        invoiceNumber: 'NW/2026-27/00042',
      });

      await service.cancel('inv-1', 'Duplicate of 00041', 'admin-1');

      const data = prisma.invoice.update.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(data.status).toBe('CANCELLED');
      expect(data).not.toHaveProperty('invoiceNumber');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
