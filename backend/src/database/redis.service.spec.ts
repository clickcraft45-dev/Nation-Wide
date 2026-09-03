import { RedisService } from './redis.service';

// The regression these guard: on ioredis defaults, a command issued while Redis is unreachable
// is queued and retried for ~10.6s before rejecting — and no cache call site caught that
// rejection, so a Redis outage made GET /tracking/:id wait ten seconds and then 500, for data it
// had already read out of the database. The client now fails fast, which only helps if every
// cache call site treats that failure as a miss.
//
// Built off the prototype rather than `new RedisService(...)`: the real constructor opens a
// socket, and none of this behaviour depends on one.
function serviceWithFailingRedis(err: Error) {
  const get = jest
    .fn<Promise<string | null>, [string]>()
    .mockRejectedValue(err);
  const set = jest.fn().mockRejectedValue(err);
  const del = jest.fn().mockRejectedValue(err);
  const warn = jest.fn();

  const service = Object.create(RedisService.prototype) as RedisService;
  Object.assign(service, {
    get,
    set,
    del,
    degraded: false,
    logger: { warn, log: jest.fn() },
  });

  return { service, get, set, del, warn };
}

describe('RedisService cache helpers', () => {
  const outage = new Error(
    "Stream isn't writeable and enableOfflineQueue options is false",
  );

  it('reports a read against a dead Redis as a cache miss, not a rejection', async () => {
    const { service } = serviceWithFailingRedis(outage);
    await expect(service.cacheGet('tracking:NW-1')).resolves.toBeNull();
  });

  it('swallows a failed write — nothing downstream depends on it landing', async () => {
    const { service, set } = serviceWithFailingRedis(outage);
    await expect(
      service.cacheSet('tracking:NW-1', '{}', 300),
    ).resolves.toBeUndefined();
    expect(set).toHaveBeenCalledWith('tracking:NW-1', '{}', 'EX', 300);
  });

  it('swallows a failed invalidation — the write it followed is already committed', async () => {
    const { service, del } = serviceWithFailingRedis(outage);
    await expect(service.cacheDel('tracking:NW-1')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith('tracking:NW-1');
  });

  it('logs an outage once, not once per call', async () => {
    const { service, warn } = serviceWithFailingRedis(outage);
    await service.cacheGet('a');
    await service.cacheGet('b');
    await service.cacheDel('c');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still passes a successful read through', async () => {
    const { service, get, warn } = serviceWithFailingRedis(outage);
    get.mockResolvedValue('{"ok":true}');
    await expect(service.cacheGet('tracking:NW-1')).resolves.toBe(
      '{"ok":true}',
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
