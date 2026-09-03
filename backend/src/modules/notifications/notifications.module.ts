import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  NotificationsService,
  NOTIFICATIONS_QUEUE,
} from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { MessagingAdapterRegistry } from './messaging-adapter.registry';
import { StubWhatsAppAdapter } from './whatsapp/stub-whatsapp.adapter';
import { GupshupWhatsAppAdapter } from './whatsapp/gupshup-whatsapp.adapter';
import { WhatsAppWebhookController } from './whatsapp/whatsapp-webhook.controller';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        // Plain connection options, not a manually-constructed ioredis instance — @nestjs/bullmq
        // then owns the underlying connections (the queue's and the worker's separate blocking
        // one) and closes them itself on app shutdown. A raw `new Redis(...)` here has no Nest
        // lifecycle hook, so app.close() would never disconnect it and leave the process hanging.
        const url = new URL(configService.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  controllers: [WhatsAppWebhookController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    MessagingAdapterRegistry,
    StubWhatsAppAdapter,
    GupshupWhatsAppAdapter,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
