import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './database/redis.service';

interface HealthCheckResult {
  status: 'ok' | 'error';
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

    const result: HealthCheckResult = {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'error',
      checks: { database, redis },
      timestamp: new Date().toISOString(),
    };

    res.status(result.status === 'ok' ? 200 : 503).json(result);
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
