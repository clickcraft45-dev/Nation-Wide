/**
 * One WhatsApp template an admin can send by hand — one of the automated notifications, or a
 * custom template approved later in Gupshup and added to GUPSHUP_TEMPLATES.
 *
 * `params` is the positional order of the template's {{n}} placeholders, straight from config:
 * `params[0]` fills {{1}}. The send form renders one input per entry, in that order.
 */
export interface WhatsAppTemplateDto {
  name: string;
  params: string[];
  /**
   * The message with every {{n}} left in place, for the send form's preview. Null for a custom
   * template the app has no wording for — Gupshup holds the approved text, and the app only knows
   * the wording of the notifications it sends itself.
   */
  body: string | null;
  /**
   * True for the two that carry a PDF (invoice_ready, receipt_ready). They cannot be sent by hand:
   * there is no document to attach, and Gupshup rejects a document-header template sent without
   * one.
   */
  requiresDocument: boolean;
}

/**
 * Result of a manual send. A batch reports partial success rather than failing as a whole — one
 * customer with no phone number must not stop the other forty.
 */
export interface WhatsAppSendResultDto {
  queued: number;
  failed: { customerId: string; reason: string }[];
}
