import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  OnlinePaymentsService,
  type YoupiWebhookPayload,
} from './online-payments.service';
import { YoupiClient } from './youpi.client';

/**
 * Where the YouPI gateway reports what happened to a checkout.
 *
 * No auth guard: the caller is the gateway, not a signed-in user. Each request is authenticated
 * by `X-Gateway-Signature`, an HMAC-SHA256 of the exact request bytes keyed with the merchant's
 * webhook secret. That proves who sent the message. It does not prove money arrived, which is
 * why nothing here marks an order paid (see OnlinePaymentsService.confirm).
 */
@Controller('webhooks/youpi')
export class YoupiWebhookController {
  constructor(
    private readonly onlinePayments: OnlinePaymentsService,
    private readonly youpi: YoupiClient,
  ) {}

  // The gateway sends every event from one address and retries in bursts; the signature check
  // below is what protects this route, at the cost of one hash per rejected request.
  @SkipThrottle()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-gateway-signature') signature: string | undefined,
    @Headers('x-gateway-delivery-id') deliveryHeader: string | undefined,
  ): Promise<{ received: true }> {
    const rawBody = this.verifySignature(req.rawBody, signature);

    // Parsed from the bytes that were signed, not from Nest's already-parsed body, so what is
    // acted on is exactly what was authenticated.
    let payload: YoupiWebhookPayload & { deliveryId?: unknown };
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as typeof payload;
    } catch {
      throw new BadRequestException('Webhook body is not JSON');
    }
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Webhook body is not an object');
    }

    // The id inside the signed body is preferred over the header, which is not covered by the
    // signature. Both are stable across the gateway's retries.
    const deliveryId =
      typeof payload.deliveryId === 'string' && payload.deliveryId
        ? payload.deliveryId
        : deliveryHeader;
    if (!deliveryId || deliveryId.length > 128) {
      throw new BadRequestException('Webhook has no delivery id');
    }

    await this.onlinePayments.applyWebhook(deliveryId, payload);
    return { received: true };
  }

  private verifySignature(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
  ): Buffer {
    const secret = this.youpi.webhookSecret();
    if (!secret) {
      throw new UnauthorizedException('Webhook signing is not configured');
    }
    if (!rawBody || !signatureHeader?.startsWith('sha256=')) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expected = Buffer.from(
      createHmac('sha256', secret).update(rawBody).digest('hex'),
    );
    const presented = Buffer.from(signatureHeader.slice('sha256='.length));
    // Length first: timingSafeEqual throws on a mismatch instead of returning false.
    if (
      expected.length !== presented.length ||
      !timingSafeEqual(expected, presented)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return rawBody;
  }
}
