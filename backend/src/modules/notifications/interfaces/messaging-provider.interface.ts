export interface SendTemplateMessageResult {
  providerMessageId: string;
}

/**
 * Every concrete adapter (stub today; a real Meta WhatsApp Cloud API adapter once WABA
 * credentials exist) implements this and is solely responsible for translating to/from that
 * channel's own request/response format and auth scheme. Mirrors the ShippingProvider pattern
 * in provider-integration/ — same reason: swap the adapter, nothing else changes.
 */
/**
 * A file to deliver alongside a template message.
 *
 * A URL, not bytes: Meta's Cloud API fetches media from a link the caller supplies (or from a
 * pre-uploaded media id) rather than accepting an upload on the send call, so handing an adapter
 * a Buffer would only force every adapter to invent its own hosting. The URL must be publicly
 * reachable over HTTPS — Meta's servers fetch it, not the recipient's phone — which is why
 * InvoicesService signs it rather than relying on an authenticated route.
 */
export interface OutboundDocument {
  url: string;
  /** Shown to the recipient in the chat, e.g. "NW-2026-27-00042.pdf". */
  filename: string;
}

export interface MessagingProvider {
  sendTemplateMessage(
    to: string,
    template: string,
    variables: Record<string, string>,
  ): Promise<SendTemplateMessageResult>;

  /**
   * Sends a template message carrying a document attachment. Separate from sendTemplateMessage
   * rather than an optional parameter on it because Meta treats them as different message types
   * with different template header requirements — a template approved for text cannot carry a
   * document header, so the two can never be silently interchanged.
   */
  sendDocumentMessage(
    to: string,
    template: string,
    variables: Record<string, string>,
    document: OutboundDocument,
  ): Promise<SendTemplateMessageResult>;
}
