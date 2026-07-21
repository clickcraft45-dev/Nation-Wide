import { Injectable } from '@nestjs/common';
import type { MessagingProvider } from './interfaces/messaging-provider.interface';
import { StubWhatsAppAdapter } from './whatsapp/stub-whatsapp.adapter';

/**
 * Same pattern as ProviderAdapterRegistry in provider-integration/: resolves a channel name to
 * the concrete adapter driving it today. Swapping the stub for a real Meta Cloud API adapter is
 * a new adapter class + registering it here — nothing else in the notifications pipeline changes.
 */
@Injectable()
export class MessagingAdapterRegistry {
  private readonly adaptersByChannel = new Map<string, MessagingProvider>();

  constructor(stubWhatsApp: StubWhatsAppAdapter) {
    this.adaptersByChannel.set('WHATSAPP', stubWhatsApp);
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
