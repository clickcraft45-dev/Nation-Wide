import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A refusal from the gateway, or a failure to reach it. `code` is the gateway's own, when sent. */
export class YoupiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'YoupiError';
  }
}

export interface YoupiSession {
  paymentId: string;
  checkoutUrl: string;
  status: string;
}

interface YoupiSettings {
  apiUrl: string;
  merchantId: string;
  merchantApiKey: string;
  webhookSecret: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The HTTP side of YouPI PG (https://github.com/youpi-pg/YouPI-PG), a self-hosted UPI checkout.
 *
 * Written against the gateway's route handlers rather than its README, because the two disagree:
 * POST /api/v1/payments refuses any call without X-Merchant-Id and a server-side X-Merchant-Key
 * (the `mk_live_...` API key, which is NOT the webhook secret), and refuses a returnUrl whose
 * origin is not listed in the gateway's own YOUPI_ALLOWED_RETURN_ORIGINS.
 */
@Injectable()
export class YoupiClient {
  private readonly logger = new Logger(YoupiClient.name);

  constructor(private readonly config: ConfigService) {}

  /** All four settings or nothing: a half-configured gateway takes no payments. */
  private settings(): YoupiSettings | null {
    const apiUrl = this.config.get<string>('YOUPI_API_URL')?.trim();
    const merchantId = this.config.get<string>('YOUPI_MERCHANT_ID')?.trim();
    const merchantApiKey = this.config
      .get<string>('YOUPI_MERCHANT_API_KEY')
      ?.trim();
    const webhookSecret = this.config
      .get<string>('YOUPI_WEBHOOK_SECRET')
      ?.trim();
    if (!apiUrl || !merchantId || !merchantApiKey || !webhookSecret) {
      return null;
    }
    return {
      apiUrl: apiUrl.replace(/\/+$/, ''),
      merchantId,
      merchantApiKey,
      webhookSecret,
    };
  }

  isConfigured(): boolean {
    return this.settings() !== null;
  }

  webhookSecret(): string | null {
    return this.settings()?.webhookSecret ?? null;
  }

  async createPayment(input: {
    orderId: string;
    amountPaise: number;
    returnUrl: string;
    description: string;
    metadata: Record<string, string>;
  }): Promise<YoupiSession> {
    const body = await this.request('POST', '/api/v1/payments', {
      idempotencyKey: input.orderId,
      body: {
        orderId: input.orderId,
        amount: paiseToRupeesString(input.amountPaise),
        currency: 'INR',
        returnUrl: input.returnUrl,
        description: input.description,
        metadata: input.metadata,
      },
    });

    const paymentId = stringField(body, 'paymentId');
    const checkoutUrl = stringField(body, 'checkoutUrl');
    // The browser is redirected to this, so it is checked rather than trusted: a gateway that
    // answered with anything but a web address has not given us a checkout page.
    if (!paymentId || !checkoutUrl || !/^https?:\/\//i.test(checkoutUrl)) {
      throw new YoupiError(
        'The gateway did not return a checkout page.',
        null,
        null,
      );
    }
    return {
      paymentId,
      checkoutUrl,
      status: stringField(body, 'status') ?? 'INITIATED',
    };
  }

  /** The gateway's current word on a session, or null when it cannot be reached. */
  async fetchStatus(paymentId: string): Promise<string | null> {
    try {
      const body = await this.request(
        'GET',
        `/api/v1/payments/${encodeURIComponent(paymentId)}`,
      );
      return stringField(body, 'status');
    } catch (error) {
      this.logger.warn(
        `Could not read YouPI session ${paymentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    const settings = this.settings();
    if (!settings) {
      throw new YoupiError('The gateway is not configured.', null, null);
    }

    let response: Response;
    try {
      response = await fetch(`${settings.apiUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Id': settings.merchantId,
          'X-Merchant-Key': settings.merchantApiKey,
          ...(options.idempotencyKey
            ? { 'Idempotency-Key': options.idempotencyKey }
            : {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new YoupiError(
        `The gateway could not be reached: ${
          error instanceof Error ? error.message : String(error)
        }`,
        null,
        null,
      );
    }

    const parsed: unknown = await response.json().catch(() => null);
    const body =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};

    if (!response.ok) {
      throw new YoupiError(
        stringField(body, 'message') ??
          stringField(body, 'error') ??
          `The gateway answered ${response.status}.`,
        response.status,
        stringField(body, 'code'),
      );
    }
    return body;
  }
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** 123450 -> "1234.50". Integer maths, because the gateway compares amounts exactly. */
export function paiseToRupeesString(paise: number): string {
  return `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}
