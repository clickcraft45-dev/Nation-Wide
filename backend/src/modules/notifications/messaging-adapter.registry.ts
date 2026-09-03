import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MessagingProvider } from './interfaces/messaging-provider.interface';
import { StubWhatsAppAdapter } from './whatsapp/stub-whatsapp.adapter';
import { GupshupWhatsAppAdapter } from './whatsapp/gupshup-whatsapp.adapter';

/**
 * Same pattern as ProviderAdapterRegistry in provider-integration/: resolves a channel name to
 * the concrete adapter driving it today. Swapping the stub for a real Meta Cloud API adapter is
 * a new adapter class + registering it here — nothing else in the notifications pipeline changes.
 */
@Injectable()
export class MessagingAdapterRegistry {
  private readonly logger = new Logger(MessagingAdapterRegistry.name);
  private readonly adaptersByChannel = new Map<string, MessagingProvider>();

  constructor(
    stubWhatsApp: StubWhatsAppAdapter,
    gupshupWhatsApp: GupshupWhatsAppAdapter,
    config: ConfigService,
  ) {
    // Chosen once, at startup, on whether Gupshup is fully configured — and logged either way.
    // A half-configured deployment falls back to the loud stub rather than throwing on the first
    // customer notification of the day, and the log line says which one is live so "did that
    // actually send?" is answerable from the boot output alone.
    const useGupshup = GupshupWhatsAppAdapter.isConfigured(config);
    this.adaptersByChannel.set(
      'WHATSAPP',
      useGupshup ? gupshupWhatsApp : stubWhatsApp,
    );
    this.logger.log(
      useGupshup
        ? 'WhatsApp channel: Gupshup adapter (messages will really be sent)'
        : 'WhatsApp channel: STUB adapter — nothing will actually be delivered. Set GUPSHUP_API_KEY, GUPSHUP_SOURCE_PHONE, GUPSHUP_APP_NAME and GUPSHUP_TEMPLATES to go live.',
    );
  }

  resolve(channel: string): MessagingProvider {
    const adapter = this.adaptersByChannel.get(channel);
    if (!adapter) {
      throw new Error(
        `No messaging adapter registered for channel "${channel}"`,
      );
    }
    return adapter;
  }
}
