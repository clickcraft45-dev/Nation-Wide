import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * The app's shared Redis client. BullMQ deliberately does NOT use this one — @nestjs/bullmq owns
 * its own queue/worker connections (see notifications.module.ts), which need different options.
 *
 * Everything this client is used for is a CACHE. Redis being down must therefore be a slow path,
 * never a broken one: reads fall through to the source of truth, writes and invalidations are
 * skipped. Use the cache* helpers below rather than the raw ioredis methods so that stays true at
 * every call site.
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  /** Log the first failure of an outage, then stay quiet until it recovers. */
  private degraded = false;

  constructor(configService: ConfigService) {
    super(configService.getOrThrow<string>('REDIS_URL'), {
      // THE important one. On ioredis defaults a command issued while Redis is unreachable goes
      // into an offline queue and is retried until maxRetriesPerRequest (20) is exhausted —
      // measured at ~10.6s against a dead server — and only then rejects. No cache call site was
      // catching that rejection, so a Redis outage turned GET /tracking/:id into a ~10s wait
      // followed by a 500, for a shipment the request had already read out of the database. The
      // same rejection hit shipments.updateTrackingStatus AFTER its write had committed, so the
      // caller saw a failure for an update that had actually succeeded. Failing fast (0ms) turns
      // a Redis outage back into what it should be: a cache miss.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      // Covers the other shape of the same problem: connected, but the server never answers.
      // A cache read that takes longer than this has already cost more than it can save.
      commandTimeout: 1000,
    });

    // ioredis emits 'error' on every failed reconnect attempt. Unhandled, Node reports each one
    // as an unhandled error event; the app only needs to know it is running degraded.
    this.on('error', (err: Error) => this.noteFailure(err));
    this.on('ready', () => {
      if (this.degraded) {
        this.degraded = false;
        this.logger.log('Redis connection restored — caching re-enabled');
      }
    });
  }

  /** Best-effort read. A Redis outage is a cache miss, never a failed request. */
  async cacheGet(key: string): Promise<string | null> {
    try {
      return await this.get(key);
    } catch (err) {
      this.noteFailure(err);
      return null;
    }
  }

  /** Best-effort write. Nothing downstream depends on the value having been stored. */
  async cacheSet(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.noteFailure(err);
    }
  }

  /**
   * Best-effort invalidation. The write that prompted it has already been committed, so failing
   * here must not fail that operation — and while Redis is unreachable nothing can read the stale
   * entry anyway, since cacheGet is failing too. The entry's TTL is the backstop for the window
   * where Redis returns *after* an invalidation was missed.
   */
  async cacheDel(key: string): Promise<void> {
    try {
      await this.del(key);
    } catch (err) {
      this.noteFailure(err);
    }
  }

  private noteFailure(err: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    this.logger.warn(
      `Redis unavailable — serving without cache: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
