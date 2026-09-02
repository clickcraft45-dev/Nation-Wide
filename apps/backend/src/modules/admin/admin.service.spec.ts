import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makeLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    providerId: 'provider-1',
    responseStatus: 200,
    responsePayload: null,
    latencyMs: 100,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AdminService', () => {
  let prisma: {
    shippingProvider: { findUnique: jest.Mock };
    apiRequestLog: { findMany: jest.Mock };
    auditLog: { findMany: jest.Mock };
    customer: { count: jest.Mock };
    quote: { count: jest.Mock };
    pickup: { count: jest.Mock };
    order: { count: jest.Mock };
  };
  let service: AdminService;

  beforeEach(() => {
    prisma = {
      shippingProvider: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'provider-1', code: 'ICL' }),
      },
      apiRequestLog: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      customer: { count: jest.fn().mockResolvedValue(0) },
      quote: { count: jest.fn().mockResolvedValue(0) },
      pickup: { count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new AdminService(prisma as never);
  });

  describe('getIntegrationHealth', () => {
    it('404s for an unknown provider code', async () => {
      prisma.shippingProvider.findUnique.mockResolvedValue(null);
      await expect(service.getIntegrationHealth('BOGUS')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('computes success/error counts, average latency, and error rate over the window', async () => {
      prisma.apiRequestLog.findMany.mockResolvedValue([
        makeLog({ responseStatus: 200, latencyMs: 100 }),
        makeLog({ responseStatus: 200, latencyMs: 200 }),
        makeLog({
          responseStatus: 500,
          latencyMs: 300,
          responsePayload: { error: 'Timeout' },
        }),
      ]);
      const result = await service.getIntegrationHealth('ICL');
      expect(result.totalCalls).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.avgLatencyMs).toBe(200);
      expect(result.errorRatePercent).toBeCloseTo(33.3, 1);
      expect(result.lastError).toEqual({
        message: 'Timeout',
        occurredAt: expect.any(String),
      });
    });

    it('reports null latency/lastError/zero error rate when there is no traffic', async () => {
      prisma.apiRequestLog.findMany.mockResolvedValue([]);
      const result = await service.getIntegrationHealth('ICL');
      expect(result.avgLatencyMs).toBeNull();
      expect(result.lastError).toBeNull();
      expect(result.errorRatePercent).toBe(0);
      expect(result.lastCallAt).toBeNull();
    });

    it('falls back to "Unknown error" when the error payload has no error field', async () => {
      prisma.apiRequestLog.findMany.mockResolvedValue([
        makeLog({ responseStatus: 500, responsePayload: { foo: 'bar' } }),
      ]);
      const result = await service.getIntegrationHealth('ICL');
      expect(result.lastError?.message).toBe('Unknown error');
    });
  });

  describe('listAuditLogs', () => {
    it('applies the default limit when none is given', async () => {
      await service.listAuditLogs({});
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('honors a caller-supplied limit', async () => {
      await service.listAuditLogs({ limit: 5 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('maps actor.email to actorEmail and ISO-stringifies createdAt', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          actor: { email: 'admin@nationwide.dev' },
          action: 'ORDER_PAYMENT_UPDATED',
          entity: 'Order',
          entityId: 'order-1',
          before: { paymentStatus: 'PENDING' },
          after: { paymentStatus: 'PAID' },
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
      const [result] = await service.listAuditLogs({});
      expect(result.actorEmail).toBe('admin@nationwide.dev');
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('getDashboardSummary', () => {
    it('wires each KPI to its own count query with the right filters', async () => {
      prisma.quote.count
        .mockResolvedValueOnce(10) // newQuotes
        .mockResolvedValueOnce(3); // needsManualReview
      prisma.pickup.count
        .mockResolvedValueOnce(4) // scheduledPickups
        .mockResolvedValueOnce(1); // dropOffs
      prisma.order.count.mockResolvedValueOnce(2); // pendingPayments
      prisma.customer.count.mockResolvedValueOnce(7); // totalCustomers

      const result = await service.getDashboardSummary();

      expect(result).toEqual({
        totalCustomers: 7,
        newQuotes: 10,
        needsManualReview: 3,
        scheduledPickups: 4,
        dropOffs: 1,
        pendingPayments: 2,
      });
      expect(prisma.quote.count).toHaveBeenNthCalledWith(1, {
        where: { status: { in: ['SUBMITTED', 'NEEDS_MANUAL_REVIEW'] } },
      });
      expect(prisma.pickup.count).toHaveBeenNthCalledWith(2, {
        where: { method: 'WAREHOUSE_DROP_OFF', status: 'SCHEDULED' },
      });
      expect(prisma.order.count).toHaveBeenCalledWith({
        where: { paymentStatus: 'PENDING' },
      });
    });
  });
});
