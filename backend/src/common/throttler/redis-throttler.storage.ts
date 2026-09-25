import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
// Not re-exported from the package root, unlike ThrottlerStorage itself.
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../../database/redis.service';

const KEY_PREFIX = 'throttle:';

/**
 * Rate-limit counters in Redis instead of in each process's memory.
 *
 * @nestjs/throttler's default storage is a Map inside one Node process. That was correct while
 * the API was one process, and became wrong the moment WEB_CONCURRENCY could fork workers: every
 * worker keeps its own counter, so a limit of 60 becomes 60 PER WORKER. Measured at
 * WEB_CONCURRENCY=4: 400 parallel requests from a single IP against a 60/min route let 180
 * through. That is not only the public tracking limit — it is the login brute-force limit too.
 *
 * One shared counter in the Redis this app already runs fixes it for every @Throttle in the
 * codebase at once, and keeps limits meaningful across restarts and across replicas.
 *
 * FAILS OPEN, deliberately and in line with RedisService: if Redis is unreachable the request is
 * allowed rather than refused. A cache outage must not take authentication and tracking down with
 * it — the alternative is a Redis blip locking every customer out of the site.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private warned = false;

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `${KEY_PREFIX}${throttlerName}:${key}`;
    const blockKey = `${hitKey}:blocked`;

    try {
      // Blocked callers are answered without touching the hit counter, so hammering a blocked
      // key cannot keep extending its own window.
      const blockTtl = await this.redis.pttl(blockKey);
      if (blockTtl > 0) {
        return {
          totalHits: limit + 1,
          timeToExpire: Math.ceil(blockTtl / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockTtl / 1000),
        };
      }

      // INCR then PEXPIRE, pipelined: one round trip, and the counter is created and dated in the
      // same breath. NX on the expiry so later hits in a window do not slide it forward — the
      // window has to end for the caller to get their allowance back.
      const [incr, , pttl] = (await this.redis
        .multi()
        .incr(hitKey)
        .pexpire(hitKey, ttl, 'NX')
        .pttl(hitKey)
        .exec()) as [[Error | null, number], unknown, [Error | null, number]];

      const totalHits = incr[1];
      const timeToExpire = Math.ceil(Math.max(pttl[1], 0) / 1000);

      if (totalHits > limit && blockDuration > 0) {
        await this.redis.set(blockKey, '1', 'PX', blockDuration);
        return {
          totalHits,
          timeToExpire,
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDuration / 1000),
        };
      }

      return {
        totalHits,
        timeToExpire,
        isBlocked: totalHits > limit,
        timeToBlockExpire: totalHits > limit ? timeToExpire : 0,
      };
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          `Redis unavailable — rate limiting is not being enforced: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      // One hit, never blocked: the guard lets it through.
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
