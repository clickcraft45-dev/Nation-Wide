import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { YoupiWebhookController } from './youpi-webhook.controller';

const SECRET = 'whsec_test_5f2b9c1e7a40d683';

function signed(body: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('YoupiWebhookController', () => {
  const body = JSON.stringify({
    event: 'OBSERVED_SUCCESS',
    deliveryId: 'delivery-in-body',
    orderId: 'attempt-1',
    amountPaise: 418650,
  });

  let onlinePayments: { applyWebhook: jest.Mock };
  let youpi: { webhookSecret: jest.Mock };
  let controller: YoupiWebhookController;

  const receive = (
    raw: string | undefined,
    signature: string | undefined,
    deliveryHeader?: string,
  ) =>
    controller.receive(
      { rawBody: raw === undefined ? undefined : Buffer.from(raw) } as never,
      signature,
      deliveryHeader,
    );

  beforeEach(() => {
    onlinePayments = { applyWebhook: jest.fn().mockResolvedValue('applied') };
    youpi = { webhookSecret: jest.fn().mockReturnValue(SECRET) };
    controller = new YoupiWebhookController(
      onlinePayments as never,
      youpi as never,
    );
  });

  it('applies a correctly signed event, keyed on the delivery id inside the signed body', async () => {
    await expect(
      receive(body, signed(body), 'delivery-in-header'),
    ).resolves.toEqual({ received: true });

    expect(onlinePayments.applyWebhook).toHaveBeenCalledWith(
      'delivery-in-body',
      expect.objectContaining({ event: 'OBSERVED_SUCCESS' }),
    );
  });

  it('rejects a body that was changed after signing', async () => {
    const tampered = body.replace('418650', '100');

    await expect(receive(tampered, signed(body))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(onlinePayments.applyWebhook).not.toHaveBeenCalled();
  });

  it('rejects a signature made with another secret, or none at all', async () => {
    await expect(
      receive(body, signed(body, 'some-other-secret')),
    ).rejects.toThrow(UnauthorizedException);
    await expect(receive(body, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(onlinePayments.applyWebhook).not.toHaveBeenCalled();
  });

  it('rejects everything while no webhook secret is configured', async () => {
    youpi.webhookSecret.mockReturnValue(null);

    await expect(receive(body, signed(body))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('falls back to the header when the body carries no delivery id, and refuses when neither does', async () => {
    const bare = JSON.stringify({ event: 'EXPIRED', orderId: 'attempt-1' });

    await receive(bare, signed(bare), 'delivery-in-header');
    expect(onlinePayments.applyWebhook).toHaveBeenCalledWith(
      'delivery-in-header',
      expect.anything(),
    );

    await expect(receive(bare, signed(bare))).rejects.toThrow(
      BadRequestException,
    );
  });
});
