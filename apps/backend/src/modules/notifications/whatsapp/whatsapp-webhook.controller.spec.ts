import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { NotificationsService } from '../notifications.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

const APP_SECRET = 'test-whatsapp-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function sign(secret: string, body: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function fakeResponse(): jest.Mocked<Pick<Response, 'status' | 'send'>> {
  const res: Partial<jest.Mocked<Pick<Response, 'status' | 'send'>>> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as jest.Mocked<Pick<Response, 'status' | 'send'>>;
}

describe('WhatsAppWebhookController', () => {
  let controller: WhatsAppWebhookController;
  let notificationsService: jest.Mocked<
    Pick<NotificationsService, 'recordDeliveryStatus'>
  >;
  let configValues: Record<string, string | undefined>;

  beforeEach(() => {
    configValues = {
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      WHATSAPP_APP_SECRET: APP_SECRET,
    };
    notificationsService = { recordDeliveryStatus: jest.fn() };
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;

    controller = new WhatsAppWebhookController(
      notificationsService as unknown as NotificationsService,
      configService,
    );
  });

  describe('verify (GET handshake)', () => {
    it('echoes the challenge when the token matches', () => {
      const res = fakeResponse();
      controller.verify(
        'subscribe',
        VERIFY_TOKEN,
        'challenge-123',
        res as unknown as Response,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('challenge-123');
    });

    it('rejects a wrong-length token without throwing on the length mismatch itself', () => {
      const res = fakeResponse();
      expect(() =>
        controller.verify(
          'subscribe',
          'short',
          'challenge-123',
          res as unknown as Response,
        ),
      ).toThrow(ForbiddenException);
    });

    it('rejects a same-length but incorrect token', () => {
      const res = fakeResponse();
      const wrongSameLength = 'x'.repeat(VERIFY_TOKEN.length);
      expect(() =>
        controller.verify(
          'subscribe',
          wrongSameLength,
          'challenge-123',
          res as unknown as Response,
        ),
      ).toThrow(ForbiddenException);
    });

    it('rejects when mode is not "subscribe"', () => {
      const res = fakeResponse();
      expect(() =>
        controller.verify(
          'unsubscribe',
          VERIFY_TOKEN,
          'challenge-123',
          res as unknown as Response,
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('receive (POST)', () => {
    function req(body: Buffer): RawBodyRequest<Request> {
      return { rawBody: body } as RawBodyRequest<Request>;
    }

    it('rejects when no signature header is present', async () => {
      const body = Buffer.from(JSON.stringify({ entry: [] }));
      await expect(
        controller.receive(req(body), undefined, { entry: [] }),
      ).rejects.toThrow(UnauthorizedException);
      expect(notificationsService.recordDeliveryStatus).not.toHaveBeenCalled();
    });

    it('rejects a malformed signature header (missing sha256= prefix)', async () => {
      const body = Buffer.from(JSON.stringify({ entry: [] }));
      await expect(
        controller.receive(req(body), 'deadbeef', { entry: [] }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an incorrect signature', async () => {
      const body = Buffer.from(JSON.stringify({ entry: [] }));
      const wrongSig = `sha256=${'0'.repeat(64)}`;
      await expect(
        controller.receive(req(body), wrongSig, { entry: [] }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when WHATSAPP_APP_SECRET is not configured, even with a well-formed header', async () => {
      configValues.WHATSAPP_APP_SECRET = undefined;
      const body = Buffer.from(JSON.stringify({ entry: [] }));
      await expect(
        controller.receive(req(body), `sha256=${'0'.repeat(64)}`, {
          entry: [],
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepts a correctly signed payload and processes it', async () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    { id: 'wamid-1', status: 'delivered', timestamp: '1' },
                  ],
                },
              },
            ],
          },
        ],
      };
      const body = Buffer.from(JSON.stringify(payload));
      const signature = sign(APP_SECRET, body);

      const result = await controller.receive(req(body), signature, payload);

      expect(result).toEqual({ received: true });
      expect(notificationsService.recordDeliveryStatus).toHaveBeenCalledWith(
        'wamid-1',
        'delivered',
        undefined,
      );
    });

    it('rejects when a valid signature is computed over a different body than the parsed one', async () => {
      // Guards against an attacker sending a signature for one payload while the parsed body
      // (used for the actual DB write) differs — the signature must cover req.rawBody exactly.
      const signedBody = Buffer.from(JSON.stringify({ entry: [] }));
      const signature = sign(APP_SECRET, signedBody);
      const differentBody = Buffer.from(JSON.stringify({ entry: ['x'] }));

      await expect(
        controller.receive(req(differentBody), signature, { entry: ['x'] }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
