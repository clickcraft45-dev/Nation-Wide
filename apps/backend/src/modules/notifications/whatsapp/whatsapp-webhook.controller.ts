import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { NotificationsService } from '../notifications.service';
import { extractStatusUpdates } from './whatsapp-webhook.types';

/**
 * Meta calls these two endpoints directly — no auth guard, since Meta isn't a logged-in staff
 * user. The GET handshake and the shared verify token are the only protection available before
 * a real WABA exists; a real deployment should also verify the X-Hub-Signature-256 header using
 * the Meta App Secret once one is issued.
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
      verifyToken === expectedToken
    ) {
      res.status(200).send(challenge);
      return;
    }
    throw new ForbiddenException('Webhook verification failed');
  }

  @Post()
  @HttpCode(200)
  async receive(@Body() payload: unknown): Promise<{ received: true }> {
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
}
