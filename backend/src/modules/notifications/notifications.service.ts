import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { OutboundDocument } from './interfaces/messaging-provider.interface';
import { PushService } from '../push/push.service';
import { renderMessageBody } from './message-bodies';

export const NOTIFICATIONS_QUEUE = 'notifications';

export interface NotificationJobData {
  notificationId: string;
  variables: Record<string, string>;
  /** Present only for document-carrying messages (invoices today). See MessagingProvider. */
  document?: OutboundDocument;
}

const DELIVERY_STATUS_MAP: Record<string, NotificationStatus> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<NotificationJobData>,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {
    // The Queue holds its own Redis connection, separate from the Worker's — each needs its
    // own 'error' listener, or an unhandled 'error' event crashes the whole Node process
    // (Node's default EventEmitter behavior), not just this queue.
    this.queue.on('error', (error) => {
      this.logger.warn(`Notifications queue error: ${error.message}`);
    });
  }

  /**
   * Creates the Notification row immediately (status QUEUED) so the log reflects the attempt
   * even before a worker picks it up, then enqueues the send with retry/backoff (Section 18).
   */
  async enqueue(
    customerId: string,
    channel: NotificationChannel,
    template: string,
    variables: Record<string, string> = {},
    document?: OutboundDocument,
  ): Promise<string> {
    const notification = await this.prisma.notification.create({
      data: { customerId, channel, template, status: 'QUEUED' },
    });

    await this.queue.add(
      'send',
      { notificationId: notification.id, variables, document },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    // The same message as a phone notification, for customers who turned them on in the app.
    // Riding on enqueue means every existing trigger (tracking updates, pickup steps, invoices)
    // gets it with no change at the call site. Fire-and-forget: PushService never throws, and a
    // push must never hold up or fail the WhatsApp send it accompanies.
    void this.push.sendToCustomer(customerId, {
      title: 'NationWide Logistics',
      body: renderMessageBody(template, variables),
      url: pushUrlFor(template),
      tag: template,
    });

    // Returns the id so a caller that has to record what it sent (InvoicesService, linking an
    // invoice to its delivery attempt) doesn't have to re-query for the row it just created.
    return notification.id;
  }

  /**
   * Applies a delivery-status webhook callback (Section 18). Uses updateMany rather than
   * update — an unknown or already-processed providerMessageId (duplicate webhook delivery,
   * which Meta's API does not guarantee against) should be a silent no-op, not a thrown error.
   */
  async recordDeliveryStatus(
    providerMessageId: string,
    rawStatus: string,
    errorMessage?: string,
  ): Promise<void> {
    const status = DELIVERY_STATUS_MAP[rawStatus];
    if (!status) {
      return;
    }

    const data: Prisma.NotificationUpdateManyMutationInput = { status };
    if (status === 'DELIVERED') data.deliveredAt = new Date();
    if (status === 'READ') data.readAt = new Date();
    if (status === 'FAILED' && errorMessage) data.errorMessage = errorMessage;

    await this.prisma.notification.updateMany({
      where: { providerMessageId },
      data,
    });
  }
}

/** Where tapping the phone notification lands in the customer app. */
function pushUrlFor(template: string): string {
  if (/invoice|receipt|payment/.test(template)) return '/documents';
  if (/quote/.test(template)) return '/quotes';
  if (
    /^pickup_(request|partner|verification|or_dropoff|rejected)|^custom_text$/.test(
      template,
    )
  ) {
    return '/dashboard';
  }
  return '/orders';
}
