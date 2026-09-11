import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../database/prisma.service';

/** What the service worker (frontend/public/sw.js) receives and shows. */
export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. Same-origin path, e.g. "/orders". */
  url: string;
  /** A newer notification with the same tag replaces the older one instead of stacking. */
  tag?: string;
}

export interface PushOwner {
  customerId?: string;
  adminUserId?: string;
}

/**
 * The push services browsers actually use — Google (Chrome, Edge on Android, most Android
 * browsers), Mozilla (Firefox), Microsoft (Edge on Windows) and Apple (Safari, iOS home-screen
 * apps).
 *
 * This allowlist is a security control, not tidiness. The endpoint is a URL the BROWSER hands us,
 * and every send makes this server POST to it. Accepting any https URL would let a logged-in user
 * register an internal address as their "push endpoint" and have the backend call it on their
 * behalf every time they get a notification — a textbook SSRF.
 */
const PUSH_SERVICE_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
  );
}

/**
 * Web Push: notifications on the customer's or partner's phone, even with the app closed.
 *
 * Deliberately best-effort everywhere. A push accompanies something that already happened — a
 * WhatsApp message, a pickup assignment — and must never fail it: every send swallows its own
 * errors, and with no VAPID keys configured the whole service is a quiet no-op.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string | null;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    if (publicKey && privateKey) {
      webpush.setVapidDetails(
        // Who push services contact about abuse. A URL is accepted as well as a mailto:.
        config.get<string>('VAPID_SUBJECT') ??
          'https://www.nationwidelogistics.co',
        publicKey,
        privateKey,
      );
      this.publicKey = publicKey;
    } else {
      this.publicKey = null;
      this.logger.warn(
        'Push notifications are off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to turn them on.',
      );
    }
  }

  /** Null when push is off — the app then tells the user rather than failing to subscribe. */
  get vapidPublicKey(): string | null {
    return this.publicKey;
  }

  /**
   * Upsert by endpoint. The same device subscribing again — or a second person logging in on a
   * shared phone — moves the row to whoever is signed in now, so notifications follow the
   * current account rather than the first one that ever turned them on.
   */
  async subscribe(
    owner: PushOwner,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ): Promise<void> {
    const data = {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      customerId: owner.customerId ?? null,
      adminUserId: owner.adminUserId ?? null,
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { endpoint: subscription.endpoint, ...data },
      update: data,
    });
  }

  /** Scoped to the owner: nobody removes another account's device by guessing its endpoint. */
  async unsubscribe(endpoint: string, owner: PushOwner): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        customerId: owner.customerId ?? null,
        adminUserId: owner.adminUserId ?? null,
      },
    });
  }

  sendToCustomer(customerId: string, payload: PushPayload): Promise<void> {
    return this.send({ customerId }, payload);
  }

  sendToAdminUser(adminUserId: string, payload: PushPayload): Promise<void> {
    return this.send({ adminUserId }, payload);
  }

  /** Never throws. */
  private async send(
    where: { customerId?: string; adminUserId?: string },
    payload: PushPayload,
  ): Promise<void> {
    if (!this.publicKey) return;
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where,
      });
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify(payload),
              // A day: a pickup notice that arrives when a phone comes back on is still useful;
              // one that arrives next week is noise.
              { TTL: 60 * 60 * 24 },
            );
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            // 404/410 is the push service saying this subscription is gone for good — the app
            // was uninstalled or notifications were revoked. Keeping the row would retry a dead
            // endpoint on every future notification.
            if (status === 404 || status === 410) {
              await this.prisma.pushSubscription
                .delete({ where: { id: subscription.id } })
                .catch(() => undefined);
              return;
            }
            this.logger.warn(
              `Push to subscription ${subscription.id} failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Push lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
