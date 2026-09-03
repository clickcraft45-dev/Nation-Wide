import { HealthController } from './health.controller';
import type { PrismaService } from './database/prisma.service';
import type { RedisService } from './database/redis.service';
import type { Response } from 'express';

// The regression this guards: neither dependency bounds itself anywhere near a probe's timeout —
// a Postgres connect can hang for the OS TCP timeout and an unreachable Redis is retried for
// ~10s — so /health used to sit open past both. An orchestrator whose probe times out kills the container
// instead of recording it as degraded, which is the opposite of what this endpoint exists for.

function harness(
  database: () => Promise<unknown>,
  redis: () => Promise<string>,
) {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  const controller = new HealthController(
    { $queryRaw: jest.fn(database) } as unknown as PrismaService,
    { ping: jest.fn(redis) } as unknown as RedisService,
  );
  return {
    controller,
    res: { status, json } as unknown as Response,
    status,
    json,
  };
}

describe('HealthController', () => {
  it('reports ok when both dependencies answer', async () => {
    const { controller, res, status, json } = harness(
      () => Promise.resolve({ ok: 1 }),
      () => Promise.resolve('PONG'),
    );
    await controller.check(res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        checks: { database: 'ok', redis: 'ok' },
      }),
    );
  });

  it('answers 503 without waiting for a dependency that never resolves', async () => {
    // Never settles — stands in for the 30s Prisma server-selection wait.
    const { controller, res, status, json } = harness(
      () => new Promise(() => {}),
      () => Promise.resolve('PONG'),
    );
    const startedAt = Date.now();
    await controller.check(res);

    expect(Date.now() - startedAt).toBeLessThan(5000);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        checks: { database: 'error', redis: 'ok' },
      }),
    );
  });

  // Redis is a cache that fails open, so a probe must not kill a container over it — a 503 here
  // put the Railway/Docker healthchecks into a restart loop against an app serving fine.
  it('stays 200 and degraded when only Redis is down', async () => {
    const { controller, res, status, json } = harness(
      () => Promise.resolve({ ok: 1 }),
      () => Promise.reject(new Error('ECONNREFUSED')),
    );
    await expect(controller.check(res)).resolves.toBeUndefined();

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        checks: { database: 'ok', redis: 'error' },
      }),
    );
  });
});
