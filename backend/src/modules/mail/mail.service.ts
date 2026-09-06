import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10_000;

export interface OutboundEmail {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Spam filters penalise HTML-only mail, so every send has one. */
  text: string;
  replyTo?: string;
}

/**
 * The one way transactional email leaves this application.
 *
 * Brevo's REST API rather than SMTP: sending is a single authenticated POST that Node's built-in
 * fetch already covers, so there is no nodemailer dependency, no connection pool to manage and no
 * long-lived socket to keep healthy. The API key is read from the environment and never logged.
 *
 * Failure is deliberately non-fatal. Email is a notification channel, not a system of record —
 * a Brevo outage must not roll back a partner application that was already written, so send()
 * resolves false instead of throwing and the caller carries on. Anything that genuinely cannot
 * proceed without the mail (nothing today) has to check the return value.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly opsInbox: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BREVO_API_KEY') ?? '';
    this.fromEmail =
      this.config.get<string>('MAIL_FROM_EMAIL') ?? 'no-reply@nationwidelogistics.co';
    this.fromName = this.config.get<string>('MAIL_FROM_NAME') ?? 'NationWide Logistics';
    // Where internal alerts land. Falls back to the sender so a missing setting degrades to a
    // deliverable address rather than a silently dropped alert.
    this.opsInbox = this.config.get<string>('MAIL_OPS_INBOX') ?? this.fromEmail;
  }

  /** False when no API key is set, so callers can skip work and dev boxes stay quiet. */
  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  get operationsInbox(): string {
    return this.opsInbox;
  }

  async send(email: OutboundEmail): Promise<boolean> {
    if (!this.isConfigured) {
      // Not an error: local and CI runs have no key, and the flows that send mail must still work.
      this.logger.warn(
        `BREVO_API_KEY not set — skipping email "${email.subject}" to ${email.to}`,
      );
      return false;
    }

    try {
      const response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: this.fromEmail, name: this.fromName },
          to: [{ email: email.to, ...(email.toName ? { name: email.toName } : {}) }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
          ...(email.replyTo ? { replyTo: { email: email.replyTo } } : {}),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        // Body, not just status — Brevo puts the actual reason (unverified sender, bad key,
        // hard bounce) in it, and without that a 400 here is unactionable.
        const detail = await response.text().catch(() => '');
        this.logger.error(
          `Brevo rejected "${email.subject}" to ${email.to}: ${response.status} ${detail.slice(0, 300)}`,
        );
        return false;
      }

      this.logger.log(`Sent "${email.subject}" to ${email.to}`);
      return true;
    } catch (error) {
      // Never the key, never the full payload — just what failed and to whom.
      this.logger.error(
        `Could not send "${email.subject}" to ${email.to}: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
