jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import * as webpush from 'web-push';
import { isPushServiceEndpoint, PushService } from './push.service';

const sendNotification = webpush.sendNotification as unknown as jest.Mock;

function config(keys: boolean) {
  return {
    get: jest.fn((key: string) =>
      keys && key.startsWith('VAPID_') ? `${key}-value` : undefined,
    ),
  };
}

describe('PushService', () => {
  let prisma: {
    pushSubscription: {
      findMany: jest.Mock;
      delete: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue({});
    prisma = {
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 's-1',
            endpoint: 'https://fcm.googleapis.com/a',
            p256dh: 'p',
            auth: 'a',
          },
          {
            id: 's-2',
            endpoint: 'https://fcm.googleapis.com/b',
            p256dh: 'p',
            auth: 'a',
          },
        ]),
        delete: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  });

  const payload = { title: 'T', body: 'B', url: '/orders' };

  it('sends to every device the customer has', async () => {
    const service = new PushService(config(true) as never, prisma as never);
    await service.sendToCustomer('c-1', payload);
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { customerId: 'c-1' },
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual(payload);
  });

  it('drops a subscription the push service reports as gone, and keeps the rest', async () => {
    sendNotification
      .mockRejectedValueOnce(
        Object.assign(new Error('Gone'), { statusCode: 410 }),
      )
      .mockResolvedValueOnce({});
    const service = new PushService(config(true) as never, prisma as never);
    await service.sendToAdminUser('p-1', payload);
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { id: 's-1' },
    });
    expect(prisma.pushSubscription.delete).toHaveBeenCalledTimes(1);
  });

  it('never throws, even when every send fails', async () => {
    sendNotification.mockRejectedValue(new Error('network down'));
    const service = new PushService(config(true) as never, prisma as never);
    await expect(
      service.sendToCustomer('c-1', payload),
    ).resolves.toBeUndefined();
  });

  it('is a quiet no-op with no VAPID keys configured', async () => {
    const service = new PushService(config(false) as never, prisma as never);
    await service.sendToCustomer('c-1', payload);
    expect(service.vapidPublicKey).toBeNull();
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('moves an existing device to whoever subscribes with it now', async () => {
    const service = new PushService(config(true) as never, prisma as never);
    await service.subscribe(
      { adminUserId: 'p-1' },
      {
        endpoint: 'https://fcm.googleapis.com/a',
        keys: { p256dh: 'p', auth: 'a' },
      },
    );
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://fcm.googleapis.com/a' },
        update: expect.objectContaining({
          adminUserId: 'p-1',
          customerId: null,
        }),
      }),
    );
  });
});

describe('isPushServiceEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QGuQyavXutnMH',
  ])('accepts a real push service: %s', (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost:4000/api',
    'https://fcm.googleapis.com.attacker.example/x',
    'not a url',
  ])(
    'refuses anything else, so the server cannot be pointed inward: %s',
    (endpoint) => {
      expect(isPushServiceEndpoint(endpoint)).toBe(false);
    },
  );
});
