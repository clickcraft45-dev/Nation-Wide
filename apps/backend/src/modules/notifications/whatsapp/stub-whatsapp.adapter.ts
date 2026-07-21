import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  MessagingProvider,
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
}
