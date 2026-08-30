import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { MessagingAdapterRegistry } from './messaging-adapter.registry';
import {
  NOTIFICATIONS_QUEUE,
  type NotificationJobData,
} from './notifications.service';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: MessagingAdapterRegistry,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { customer: true },
    });
    if (!notification) {
      // The row is gone (e.g. the customer/order was since deleted) — nothing to send or
      // update. Not an error: retrying or dead-lettering a job with no target helps no one.
      this.logger.warn(
        `Notification ${job.data.notificationId} no longer exists, skipping`,
      );
      return;
    }

    const adapter = this.adapterRegistry.resolve(notification.channel);
    // Two distinct message types at the provider, not one call with an optional field — see the
    // doc comment on MessagingProvider.sendDocumentMessage.
    const result = job.data.document
      ? await adapter.sendDocumentMessage(
          notification.customer.phone,
          notification.template,
          job.data.variables,
          job.data.document,
        )
      : await adapter.sendTemplateMessage(
          notification.customer.phone,
          notification.template,
          job.data.variables,
        );

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
      },
    });
  }

  /**
   * Fires on every failed attempt, not just the final one — only mark the notification
   * permanently FAILED once BullMQ has exhausted retries, so a transient failure that later
   * succeeds doesn't leave a stale FAILED row behind (Section 18: dead-letter/alert path).
   */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<NotificationJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    try {
      // updateMany rather than update — a row that's already gone is a no-op, not an error.
      await this.prisma.notification.updateMany({
        where: { id: job.data.notificationId },
        data: { status: 'FAILED', errorMessage: error.message },
      });
    } catch (updateError) {
      this.logger.error(
        `Failed to record permanent notification failure for ${job.data.notificationId}`,
        updateError instanceof Error ? updateError.stack : String(updateError),
      );
    }
  }

  /**
   * BullMQ's Worker emits 'error' for things like a connection closing during shutdown — and
   * Node's default EventEmitter behavior for an unhandled 'error' event is to throw and crash
   * the whole process. Required, not optional: without this listener a transient Redis blip
   * takes down the entire backend, not just this queue.
   */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.warn(`Notifications worker error: ${error.message}`);
  }
}
