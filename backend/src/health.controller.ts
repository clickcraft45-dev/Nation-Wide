import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './database/redis.service';

// A probe has to answer inside the orchestrator's own timeout or the container is treated as
// dead rather than degraded, and neither dependency bounds itself anywhere near that: Postgres
// connection attempts can hang for the OS TCP timeout, and an unreachable Redis is retried for
// ~10s. A dependency that has not answered in two seconds is not
// healthy, whatever it says afterwards.
const CHECK_TIMEOUT_MS = 2000;

function withTimeout<T>(work: Promise<T>): Promise<T | 'timeout'> {
  return Promise.race([
    work,
    new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), CHECK_TIMEOUT_MS).unref(),
    ),
  ]);
}

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
  timestamp: string;
}

// Unauthenticated by design (no @UseGuards) — container orchestrators (k8s liveness/readiness
// probes, an LB health check) hit this without credentials. Deliberately returns only ok/error
// per dependency, never connection strings or error detail, so it can't be used for
// reconnaissance.
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Manually sets status (rather than throwing) so the full checks breakdown always reaches the
  // caller verbatim, unreshaped by the global exception filter's generic error envelope.
  @Get()
  async check(@Res() res: Response): Promise<void> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    // Only the database decides the HTTP status. Redis here is purely a cache — RedisService
    // fails every call open, so an outage costs latency, not correctness (see its class doc).
    // Answering 503 for it made every probe wired to this endpoint (railway.json's
    // healthcheckPath, the Dockerfile HEALTHCHECK, an LB) kill and restart a container that was
    // still serving every request correctly, turning a degraded cache into a crash loop. The
    // breakdown below still reports redis:error, and `degraded` surfaces it to anything alerting
    // on `status` alone.
    const result: HealthCheckResult = {
      status:
        database === 'error' ? 'error' : redis === 'ok' ? 'ok' : 'degraded',
      checks: { database, redis },
      timestamp: new Date().toISOString(),
    };

    res.status(database === 'ok' ? 200 : 503).json(result);
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      const result = await withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return result === 'timeout' ? 'error' : 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      const pong = await withTimeout(this.redis.ping());
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
