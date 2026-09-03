import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MessagingProvider,
  OutboundDocument,
  SendTemplateMessageResult,
} from '../interfaces/messaging-provider.interface';
import { renderMessageBody } from '../message-bodies';

/**
 * Real WhatsApp sending through Gupshup, the BSP this WABA is onboarded with.
 *
 * NOT Meta's Cloud API. Gupshup fronts WhatsApp with its own contract, and the two differ in
 * ways that matter here:
 *
 *  - Form-encoded, not JSON. The body is application/x-www-form-urlencoded and the structured
 *    parts (`template`, `message`) are JSON *strings* inside form fields.
 *  - Templates are addressed by Gupshup's own template ID (a UUID), not by the name Meta shows
 *    you. NOTIFICATION_TEMPLATES holds names, so the mapping lives in config — see TEMPLATES_KEY.
 *  - Template parameters are POSITIONAL ({{1}}, {{2}}...), while this app's MessagingProvider
 *    interface passes an unordered Record. The order therefore has to be declared per template
 *    in that same config; guessing it from object key order would silently put the amount where
 *    the customer's name belongs.
 *
 * Docs: https://docs.gupshup.io/reference/sending-document-template
 */

/** Approved-template send. Works at any time, but every template needs Meta's approval first. */
const TEMPLATE_ENDPOINT = 'https://api.gupshup.io/wa/api/v1/template/msg';

/**
 * Free-form ("session") send. No approval needed and the wording lives in message-bodies.ts —
 * but WhatsApp only permits it inside the 24-hour customer service window, i.e. within 24 hours
 * of the customer's own last message. Outside that window the platform rejects it, and the send
 * surfaces here as a Gupshup error which the queue retries and then marks FAILED.
 */
const SESSION_ENDPOINT = 'https://api.gupshup.io/wa/api/v1/msg';

/** Gupshup accepts a request in well under this; beyond it the queue's retry is the better tool. */
const TIMEOUT_MS = 10_000;

const API_KEY = 'GUPSHUP_API_KEY';
const SOURCE_KEY = 'GUPSHUP_SOURCE_PHONE';
const APP_NAME_KEY = 'GUPSHUP_APP_NAME';
const TEMPLATES_KEY = 'GUPSHUP_TEMPLATES';

/**
 * One approved template: Gupshup's UUID for it, plus the order its {{n}} placeholders appear in.
 * `params: ["customerName", "invoiceNumber", "amount"]` means {{1}} is customerName, and so on.
 */
interface TemplateConfig {
  id: string;
  params: string[];
}

@Injectable()
export class GupshupWhatsAppAdapter implements MessagingProvider {
  private readonly logger = new Logger(GupshupWhatsAppAdapter.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Whether this adapter has everything it needs. The registry uses this to decide between the
   * stub and the real thing at startup, so a half-configured deployment falls back to the loud
   * stub rather than throwing on the first customer notification of the day.
   */
  static isConfigured(config: ConfigService): boolean {
    // TEMPLATES_KEY is NOT required: with no templates configured every notification goes out as
    // a free-form session message, which is the current setup. It only has to be present for the
    // templates it actually names.
    return [API_KEY, SOURCE_KEY, APP_NAME_KEY].every((key) =>
      Boolean(config.get<string>(key)),
    );
  }

  sendTemplateMessage(
    to: string,
    template: string,
    variables: Record<string, string>,
  ): Promise<SendTemplateMessageResult> {
    return this.send(to, template, variables);
  }

  sendDocumentMessage(
    to: string,
    template: string,
    variables: Record<string, string>,
    document: OutboundDocument,
  ): Promise<SendTemplateMessageResult> {
    return this.send(to, template, variables, document);
  }

  private async send(
    to: string,
    template: string,
    variables: Record<string, string>,
    document?: OutboundDocument,
  ): Promise<SendTemplateMessageResult> {
    // An approved template is used when one is configured for this notification, and free-form
    // otherwise. That ordering matters: templates are the only thing that reaches a customer
    // outside the 24-hour window, so any template that exists should be preferred over a
    // free-form send the platform may reject. Getting a template approved later is therefore a
    // GUPSHUP_TEMPLATES change with no code change.
    const templateConfig = this.optionalTemplateConfig(template);

    const body = new URLSearchParams({
      channel: 'whatsapp',
      source: this.digitsOnly(this.config.getOrThrow<string>(SOURCE_KEY)),
      destination: this.digitsOnly(to),
      'src.name': this.config.getOrThrow<string>(APP_NAME_KEY),
    });

    if (templateConfig) {
      body.set(
        'template',
        JSON.stringify({
          id: templateConfig.id,
          // Positional, in the order the config declares. A placeholder with no matching variable
          // becomes an empty string rather than the literal "undefined" reaching a customer.
          params: templateConfig.params.map((name) => variables[name] ?? ''),
        }),
      );
      if (document) {
        // `link` and `id` are alternatives — a link means Gupshup fetches the file itself, which
        // is why InvoicesService signs a publicly-reachable URL rather than an authenticated one.
        body.set(
          'message',
          JSON.stringify({
            type: 'document',
            document: { link: document.url, filename: document.filename },
          }),
        );
      }
    } else {
      const text = renderMessageBody(template, variables);
      // One message, not two: the session `file` type carries a caption, so the PDF and the line
      // explaining it arrive together rather than as an orphaned attachment after a separate text.
      body.set(
        'message',
        JSON.stringify(
          document
            ? {
                type: 'file',
                url: document.url,
                filename: document.filename,
                caption: text,
              }
            : { type: 'text', text },
        ),
      );
    }

    const response = await fetch(
      templateConfig ? TEMPLATE_ENDPOINT : SESSION_ENDPOINT,
      {
        method: 'POST',
        headers: {
          apikey: this.config.getOrThrow<string>(API_KEY),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      messageId?: string;
      status?: string;
      message?: string;
    };

    // The two endpoints report success differently — the template one answers "success", the
    // session one "submitted". Accepting only one would treat every message sent through the
    // other as a failure.
    const accepted =
      payload.status === 'success' || payload.status === 'submitted';

    // Thrown, not swallowed: BullMQ's retry/backoff is the recovery path, and a permanent failure
    // is what marks the Notification row FAILED (see NotificationsProcessor.onFailed).
    if (!response.ok || !accepted || !payload.messageId) {
      throw new Error(
        `Gupshup rejected "${template}" (HTTP ${response.status}): ` +
          `${payload.message ?? payload.status ?? 'no message id returned'}`,
      );
    }

    return { providerMessageId: payload.messageId };
  }

  /**
   * The configured Gupshup template for this notification, or null to send free-form.
   *
   * Malformed JSON still throws. A typo in GUPSHUP_TEMPLATES silently downgrading every
   * notification to free-form would be much harder to notice than a failed send, because
   * free-form works fine in testing — the tester has just messaged the business, so the 24-hour
   * window is open — and then fails in production where it usually isn't.
   */
  private optionalTemplateConfig(template: string): TemplateConfig | null {
    const raw = this.config.get<string>(TEMPLATES_KEY);
    if (!raw) return null;

    let parsed: Record<string, TemplateConfig>;
    try {
      parsed = JSON.parse(raw) as Record<string, TemplateConfig>;
    } catch {
      throw new Error(`${TEMPLATES_KEY} is not valid JSON`);
    }

    const config = parsed[template];
    if (!config) return null;
    if (!config.id || !Array.isArray(config.params)) {
      throw new Error(
        `Malformed Gupshup template config for "${template}" in ${TEMPLATES_KEY}: ` +
          `expected {"id":"<gupshup-template-id>","params":["<placeholder order>"]}`,
      );
    }
    return config;
  }

  /**
   * Gupshup wants bare digits — `919876543210`. Customer.phone is stored E.164 (`+91...`), so the
   * leading + and any formatting have to come off or the destination is rejected as invalid.
   */
  private digitsOnly(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
