/**
 * Structural shape of Meta's WhatsApp Cloud API status-callback payload (the parts we use).
 * Deliberately not a class-validator DTO — Meta's real payload carries many more fields than we
 * model, and the app's global ValidationPipe would reject unknown fields under
 * forbidNonWhitelisted. Parsed defensively at the call site instead of enforced by class shape.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */
export interface WhatsAppStatusUpdate {
  id: string; // wamid — our providerMessageId
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: WhatsAppStatusUpdate[];
      };
    }>;
  }>;
}

export function extractStatusUpdates(payload: unknown): WhatsAppStatusUpdate[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const entries = (payload as WhatsAppWebhookPayload).entry;
  if (!Array.isArray(entries)) {
    return [];
  }

  const updates: WhatsAppStatusUpdate[] = [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (
          status &&
          typeof status.id === 'string' &&
          typeof status.status === 'string'
        ) {
          updates.push(status);
        }
      }
    }
  }
  return updates;
}
