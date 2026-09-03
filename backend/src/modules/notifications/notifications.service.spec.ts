import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let prisma: {
    notification: { create: jest.Mock; updateMany: jest.Mock };
  };
  let queue: { on: jest.Mock; add: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    queue = { on: jest.fn(), add: jest.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(queue as never, prisma as never);
  });

  it('registers an error listener on the queue so a Redis blip cannot crash the process', () => {
    expect(queue.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  describe('enqueue', () => {
    it('creates a QUEUED notification row before enqueuing the send job', async () => {
      await service.enqueue('customer-1', 'WHATSAPP', 'ORDER_CONFIRMATION', {
        trackingNumber: 'NW-26-00000001',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          customerId: 'customer-1',
          channel: 'WHATSAPP',
          template: 'ORDER_CONFIRMATION',
          status: 'QUEUED',
        },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'send',
        {
          notificationId: 'notif-1',
          variables: { trackingNumber: 'NW-26-00000001' },
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    });

    it('defaults variables to an empty object when omitted', async () => {
      await service.enqueue('customer-1', 'WHATSAPP', 'ORDER_CONFIRMATION');
      expect(queue.add).toHaveBeenCalledWith(
        'send',
        { notificationId: 'notif-1', variables: {} },
        expect.anything(),
      );
    });
  });

  describe('recordDeliveryStatus', () => {
    it('silently no-ops for an unrecognized status string', async () => {
      await service.recordDeliveryStatus('msg-1', 'bogus-status');
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it('maps "sent" to SENT with no extra timestamp fields', async () => {
      await service.recordDeliveryStatus('msg-1', 'sent');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { providerMessageId: 'msg-1' },
        data: { status: 'SENT' },
      });
    });

    it('maps "delivered" to DELIVERED and stamps deliveredAt', async () => {
      await service.recordDeliveryStatus('msg-1', 'delivered');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { providerMessageId: 'msg-1' },
        data: { status: 'DELIVERED', deliveredAt: expect.any(Date) },
      });
    });

    it('maps "read" to READ and stamps readAt', async () => {
      await service.recordDeliveryStatus('msg-1', 'read');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { providerMessageId: 'msg-1' },
        data: { status: 'READ', readAt: expect.any(Date) },
      });
    });

    it('maps "failed" to FAILED and records the error message when given', async () => {
      await service.recordDeliveryStatus('msg-1', 'failed', 'Invalid number');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { providerMessageId: 'msg-1' },
        data: { status: 'FAILED', errorMessage: 'Invalid number' },
      });
    });

    it('omits errorMessage on a "failed" status when none is given', async () => {
      await service.recordDeliveryStatus('msg-1', 'failed');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { providerMessageId: 'msg-1' },
        data: { status: 'FAILED' },
      });
    });

    it('uses updateMany (never throws) for an unmatched providerMessageId — duplicate webhooks are a no-op', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.recordDeliveryStatus('unknown-msg', 'sent'),
      ).resolves.toBeUndefined();
    });
  });
});
