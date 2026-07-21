export interface SendTemplateMessageResult {
  providerMessageId: string;
}

/**
 * Every concrete adapter (stub today; a real Meta WhatsApp Cloud API adapter once WABA
 * credentials exist) implements this and is solely responsible for translating to/from that
 * channel's own request/response format and auth scheme. Mirrors the ShippingProvider pattern
 * in provider-integration/ — same reason: swap the adapter, nothing else changes.
 */
export interface MessagingProvider {
  sendTemplateMessage(
    to: string,
    template: string,
    variables: Record<string, string>,
  ): Promise<SendTemplateMessageResult>;
}
