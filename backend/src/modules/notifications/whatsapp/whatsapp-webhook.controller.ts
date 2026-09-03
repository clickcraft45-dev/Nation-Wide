import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { NotificationsService } from '../notifications.service';
import { extractStatusUpdates } from './whatsapp-webhook.types';

/**
 * Meta calls these two endpoints directly — no auth guard, since Meta isn't a logged-in staff
 * user. The GET handshake's shared verify token proves the endpoint URL to Meta once at setup
 * time; every POST after that is authenticated per-request via the X-Hub-Signature-256 header
 * (HMAC-SHA256 of the raw body, keyed with the Meta App Secret) — see verifySignature() below.
 */
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const expectedToken = this.configService.get<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );
    if (
      mode === 'subscribe' &&
      expectedToken &&
      constantTimeStringsEqual(verifyToken, expectedToken)
    ) {
      res.status(200).send(challenge);
      return;
    }
    throw new ForbiddenException('Webhook verification failed');
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signatureHeader: string | undefined,
    @Body() payload: unknown,
  ): Promise<{ received: true }> {
    this.verifySignature(req.rawBody, signatureHeader);

    const updates = extractStatusUpdates(payload);
    for (const update of updates) {
      await this.notificationsService.recordDeliveryStatus(
        update.id,
        update.status,
        update.errors?.[0]?.title,
      );
    }
    // Always ack 200 — Meta retries aggressively on non-2xx, and a malformed/unrecognized
    // payload shape shouldn't turn into a retry storm.
    return { received: true };
  }

  // Meta signs the exact raw request bytes with the App Secret and sends
  // "sha256=<hex digest>" in X-Hub-Signature-256. Recomputing over req.rawBody (not the
  // parsed/re-serialized body) is required — JSON.stringify(parsed) is not guaranteed to
  // byte-for-byte match what Meta actually sent and signed.
  // https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
  private verifySignature(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
  ): void {
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      throw new UnauthorizedException('Webhook signing is not configured');
    }
    if (!rawBody || !signatureHeader?.startsWith('sha256=')) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expectedDigest = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    const presentedDigest = signatureHeader.slice('sha256='.length);

    if (!constantTimeStringsEqual(presentedDigest, expectedDigest)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}

// crypto.timingSafeEqual throws if the two buffers differ in length, so length is checked
// up front — that early return is on the (public) lengths of the two strings, not their
// content, so it leaks no more than what a length-mismatch response already would.
function constantTimeStringsEqual(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
