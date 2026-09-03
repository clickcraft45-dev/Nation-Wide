import { NotificationsProcessor } from './notifications.processor';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    data: { notificationId: 'notif-1', variables: {} },
    attemptsMade: 3,
    opts: { attempts: 3 },
    ...overrides,
  };
}

describe('NotificationsProcessor', () => {
  let prisma: {
    notification: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let adapterRegistry: { resolve: jest.Mock };
  let adapter: { sendTemplateMessage: jest.Mock };
  let processor: NotificationsProcessor;

  beforeEach(() => {
    adapter = {
      sendTemplateMessage: jest
        .fn()
        .mockResolvedValue({ providerMessageId: 'wamid-1' }),
    };
    adapterRegistry = { resolve: jest.fn().mockReturnValue(adapter) };
    prisma = {
      notification: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'notif-1',
          channel: 'WHATSAPP',
          template: 'ORDER_CONFIRMATION',
          customer: { phone: '+919876543210' },
        }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    processor = new NotificationsProcessor(
      prisma as never,
      adapterRegistry as never,
    );
  });

  describe('process', () => {
    it('skips silently when the notification row no longer exists', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);
      await processor.process(makeJob() as never);
      expect(adapterRegistry.resolve).not.toHaveBeenCalled();
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('resolves the adapter for the notification channel and sends via it', async () => {
      await processor.process(makeJob() as never);
      expect(adapterRegistry.resolve).toHaveBeenCalledWith('WHATSAPP');
      expect(adapter.sendTemplateMessage).toHaveBeenCalledWith(
        '+919876543210',
        'ORDER_CONFIRMATION',
        {},
      );
    });

    it('marks the notification SENT with the provider message id on success', async () => {
      await processor.process(makeJob() as never);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
          providerMessageId: 'wamid-1',
        },
      });
    });
  });

  describe('onFailed', () => {
    it('does nothing when there is no job', async () => {
      await processor.onFailed(undefined, new Error('boom'));
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it('does not mark FAILED while retries remain', async () => {
      await processor.onFailed(
        makeJob({ attemptsMade: 1, opts: { attempts: 3 } }) as never,
        new Error('transient'),
      );
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it('marks FAILED with the error message once retries are exhausted', async () => {
      await processor.onFailed(
        makeJob({ attemptsMade: 3, opts: { attempts: 3 } }) as never,
        new Error('permanent failure'),
      );
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { status: 'FAILED', errorMessage: 'permanent failure' },
      });
    });

    it('swallows a DB error while recording the failure rather than throwing', async () => {
      prisma.notification.updateMany.mockRejectedValue(new Error('db down'));
      await expect(
        processor.onFailed(
          makeJob({ attemptsMade: 3, opts: { attempts: 3 } }) as never,
          new Error('permanent failure'),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('onError', () => {
    it('does not throw for a worker-level error event', () => {
      expect(() => processor.onError(new Error('redis blip'))).not.toThrow();
    });
  });
});
