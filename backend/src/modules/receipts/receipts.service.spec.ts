import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { amountInWords } from './templates/receipt-template';

const SETTINGS = {
  legalName: 'NationWide Logistics Pvt Ltd',
  gstin: '36AABCU9603R1ZM',
  address: 'Plot 4, Hitech City, Hyderabad',
  supportEmail: 'billing@nationwidelogistics.co',
  supportPhone: '+914012345678',
  logoPath: null,
};

function makePaidOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    customerId: 'cust-1',
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
    paidAmount: 5133,
    paidAt: new Date('2026-09-10T10:00:00Z'),
    customer: { name: 'Tanush Reddy', phone: '+918555024021' },
    invoice: { id: 'inv-1', invoiceNumber: 'NW/2026-27/00042' },
    shipments: [{ internalTrackingNumber: 'NW-26-00000001' }],
    ...overrides,
  };
}

describe('ReceiptsService', () => {
  let prisma: {
    order: { findUnique: jest.Mock };
    receipt: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    invoice: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRawUnsafe: jest.Mock;
  };
  let receiptPdf: { render: jest.Mock };
  let notifications: { enqueue: jest.Mock };
  let storage: { put: jest.Mock; get: jest.Mock };
  let service: ReceiptsService;

  beforeEach(() => {
    // update() merges onto the row create() produced, like the real table does — returning only
    // the updated fields would drop receiptNumber and every other column set at issue time.
    let lastCreated: Record<string, unknown> = {};
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(makePaidOrder()) },
      receipt: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            lastCreated = { id: 'rcp-1', ...data };
            return Promise.resolve(lastCreated);
          }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...lastCreated, ...data }),
          ),
      },
      invoice: { findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // The receipt-number counter.
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 19 }]),
    };
    receiptPdf = { render: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
    notifications = { enqueue: jest.fn().mockResolvedValue('notif-1') };
    storage = {
      put: jest.fn().mockResolvedValue({ key: 'k', size: 3 }),
      get: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };

    service = new ReceiptsService(
      prisma as never,
      {
        getOrThrow: jest.fn((key: string) =>
          key === 'PUBLIC_BASE_URL'
            ? 'https://api.nationwidelogistics.co'
            : 'a-signing-secret-at-least-16-chars',
        ),
      } as never,
      { get: jest.fn().mockResolvedValue(SETTINGS) } as never,
      receiptPdf as never,
      notifications as never,
      storage as never,
    );
  });

  describe('issueForOrderPayment', () => {
    it('numbers the receipt in its own RCP series and links the invoice it settles', async () => {
      const receipt = await service.issueForOrderPayment('order-1', 'admin-1');

      expect(receipt?.receiptNumber).toBe('RCP/2026-27/00019');
      // Its own counter: a receipt must never consume a number out of the invoice series,
      // which GST requires to stay unbroken.
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.any(String),
        'receipt:2026-27',
      );
      expect(prisma.receipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: 'inv-1',
            amount: 5133,
            paymentMethod: 'UPI',
          }),
        }),
      );
      expect(storage.put).toHaveBeenCalledWith(
        'receipts/2026/09/RCP-2026-27-00019.pdf',
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('returns the existing receipt instead of issuing a second one for the same payment', async () => {
      const existing = { id: 'rcp-old', receiptNumber: 'RCP/2026-27/00007' };
      prisma.receipt.findFirst.mockResolvedValue(existing);

      const receipt = await service.issueForOrderPayment('order-1', 'admin-1');

      expect(receipt).toBe(existing);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.receipt.create).not.toHaveBeenCalled();
    });

    it('still issues when the order has no invoice yet — proof of payment must not wait on GST settings', async () => {
      prisma.order.findUnique.mockResolvedValue(
        makePaidOrder({ invoice: null }),
      );

      const receipt = await service.issueForOrderPayment('order-1', 'admin-1');

      expect(receipt).not.toBeNull();
      expect(prisma.receipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ invoiceId: null }),
        }),
      );
    });

    it('refuses an unpaid order', async () => {
      prisma.order.findUnique.mockResolvedValue(
        makePaidOrder({ paymentStatus: 'PENDING' }),
      );
      await expect(
        service.issueForOrderPayment('order-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('issueAndSendQuietly', () => {
    it('swallows a failure so the payment that triggered it is never rolled back', async () => {
      storage.put.mockRejectedValue(new Error('S3 unavailable'));

      await expect(
        service.issueAndSendQuietly('order-1', 'admin-1'),
      ).resolves.toBeUndefined();
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('public link signing', () => {
    it('is namespaced away from invoice tokens for the same id', () => {
      const token = service.signatureFor('shared-id');
      expect(service.verifySignature('shared-id', token)).toBe(true);
      expect(service.verifySignature('other-id', token)).toBe(false);
      // A malformed token must return false, not throw — timingSafeEqual throws on a length
      // mismatch, which would turn a bad URL into a 500.
      expect(service.verifySignature('shared-id', 'short')).toBe(false);
    });
  });
});

describe('amountInWords', () => {
  it('uses Indian grouping, not the western short scale', () => {
    expect(amountInWords(1_250_000)).toBe(
      'Twelve lakh fifty thousand rupees only',
    );
    expect(amountInWords(30_000_000)).toBe('Three crore rupees only');
  });

  it('names paise separately rather than rounding them away', () => {
    expect(amountInWords(5133.5)).toBe(
      'Five thousand one hundred thirty-three rupees and fifty paise only',
    );
  });

  it('handles zero and the teens', () => {
    expect(amountInWords(0)).toBe('Zero rupees only');
    expect(amountInWords(15)).toBe('Fifteen rupees only');
  });
});
