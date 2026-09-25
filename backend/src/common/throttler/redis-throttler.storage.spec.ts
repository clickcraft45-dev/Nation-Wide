import { RedisThrottlerStorage } from './redis-throttler.storage';

/** One shared counter, the way N workers would see it. */
function fakeRedis(hits = { count: 0 }) {
  const blockPttl = { value: -2 };
  return {
    hits,
    blockPttl,
    pttl: jest.fn().mockImplementation(() => Promise.resolve(blockPttl.value)),
    set: jest.fn().mockResolvedValue('OK'),
    multi: () => {
      const chain = {
        incr: () => chain,
        pexpire: () => chain,
        pttl: () => chain,
        exec: () => {
          hits.count += 1;
          return Promise.resolve([
            [null, hits.count],
            [null, 1],
            [null, 60_000],
          ]);
        },
      };
      return chain;
    },
  };
}

describe('RedisThrottlerStorage', () => {
  it('counts every worker against the same key — the whole point of moving off in-memory', async () => {
    const redis = fakeRedis();
    // Two storages standing in for two cluster workers, each with its own object but the one
    // Redis behind them.
    const workerA = new RedisThrottlerStorage(redis as never);
    const workerB = new RedisThrottlerStorage(redis as never);

    await workerA.increment('ip', 60_000, 3, 0, 'default');
    await workerB.increment('ip', 60_000, 3, 0, 'default');
    const third = await workerA.increment('ip', 60_000, 3, 0, 'default');

    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(false);
  });

  it('blocks once the limit is passed', async () => {
    const redis = fakeRedis({ count: 3 });
    const storage = new RedisThrottlerStorage(redis as never);

    const record = await storage.increment('ip', 60_000, 3, 0, 'default');

    expect(record.totalHits).toBe(4);
    expect(record.isBlocked).toBe(true);
  });

  it('answers a blocked caller without counting the hit, so hammering cannot extend the block', async () => {
    const redis = fakeRedis();
    redis.blockPttl.value = 30_000;
    const storage = new RedisThrottlerStorage(redis as never);

    const record = await storage.increment('ip', 60_000, 3, 5_000, 'default');

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(30);
    expect(redis.hits.count).toBe(0);
  });

  it('fails open when Redis is down — a cache outage must not lock everyone out of the site', async () => {
    const storage = new RedisThrottlerStorage({
      pttl: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as never);

    const record = await storage.increment('ip', 60_000, 3, 0, 'default');

    expect(record.isBlocked).toBe(false);
    expect(record.totalHits).toBe(1);
  });
});
