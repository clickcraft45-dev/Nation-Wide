import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  MessagingProvider,
  OutboundDocument,
  SendTemplateMessageResult,
} from '../interfaces/messaging-provider.interface';

/**
 * Stands in for the real Meta WhatsApp Cloud API adapter until a verified WABA + approved
 * templates exist (Section 18). Simulates an immediate "accepted" response the way Meta's API
 * does — the real delivery lifecycle (sent -> delivered -> read, or failed) arrives later via
 * webhook, not in the send response itself, so this adapter deliberately doesn't fake that part.
 */
@Injectable()
export class StubWhatsAppAdapter implements MessagingProvider {
  private readonly logger = new Logger(StubWhatsAppAdapter.name);

  sendTemplateMessage(
    to: string,
    template: string,
    variables: Record<string, string>,
  ): Promise<SendTemplateMessageResult> {
    void to;
    void variables;
    return Promise.resolve({
      providerMessageId: `stub-wamid-${randomUUID()}-${template}`,
    });
  }

  /**
   * Logs at WARN rather than silently pretending to succeed. A document send that no one receives
   * is far more surprising than a text one — this is the path that carries tax invoices to
   * customers, and "we sent it" appearing in the notifications log while nothing ever left the
   * building is precisely the failure worth making loud until a real WABA exists.
   */
  sendDocumentMessage(
    to: string,
    template: string,
    variables: Record<string, string>,
    document: OutboundDocument,
  ): Promise<SendTemplateMessageResult> {
    void variables;
    this.logger.warn(
      `STUB: no WhatsApp Business Account is configured, so "${document.filename}" was NOT ` +
        `delivered to ${to} (template "${template}", url ${document.url}). ` +
        'Configure a real adapter before relying on invoice delivery.',
    );
    return Promise.resolve({
      providerMessageId: `stub-wamid-${randomUUID()}-${template}-doc`,
    });
  }
}
