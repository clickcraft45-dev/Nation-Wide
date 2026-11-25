import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { FuelSurchargeService } from './fuel-surcharge.service';

export const FUEL_SURCHARGE_QUEUE = 'fuel-surcharge';
const SCHEDULER_ID = 'fuel-surcharge-daily';

/**
 * Each morning, before the day's first quotes, applies the carrier fuel surcharges the server can
 * read (DHL's weekly table). A BullMQ job scheduler rather than a timer: every backend process
 * upserts the same scheduler id, so however many run, the check happens once a day.
 *
 * Off when FUEL_SURCHARGE_AUTO_APPLY=false (local development, tests), so nothing reaches out to
 * the carrier's site unasked.
 */
@Processor(FUEL_SURCHARGE_QUEUE)
export class FuelSurchargeScheduler
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(FuelSurchargeScheduler.name);

  constructor(
    @InjectQueue(FUEL_SURCHARGE_QUEUE) private readonly queue: Queue,
    private readonly fuelSurcharge: FuelSurchargeService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const enabled =
      this.config.get<string>('FUEL_SURCHARGE_AUTO_APPLY') !== 'false' &&
      this.config.get<string>('NODE_ENV') !== 'test';
    try {
      if (!enabled) {
        await this.queue.removeJobScheduler(SCHEDULER_ID);
        return;
      }
      // 06:30 India time daily. DHL posts the coming week ahead; the parser takes the row for the
      // current week, so Monday's run is the one that moves the figure.
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { pattern: '0 30 6 * * *', tz: 'Asia/Kolkata' },
        { name: 'apply' },
      );
    } catch (error) {
      // Redis being down must not stop the API from starting; the admin can still apply by hand.
      this.logger.warn(
        `Could not schedule the daily fuel surcharge check: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async process(): Promise<void> {
    await this.fuelSurcharge.autoApply();
  }
}
