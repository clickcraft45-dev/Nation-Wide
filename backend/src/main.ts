import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  // rawBody: true makes Nest's body-parser stash the raw request Buffer on req.rawBody in
  // addition to the parsed JSON body — needed by the WhatsApp webhook handler to compute an
  // HMAC over the exact bytes Meta signed (see WhatsAppWebhookController).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // WITHOUT THIS, EVERY REQUEST LOOKS LIKE IT CAME FROM THE REVERSE PROXY. Nginx/Caddy on the
  // host terminates TLS and forwards to this process (see docker-compose.yml), so req.ip is the
  // proxy's address for everyone — and ThrottlerGuard keys its per-IP buckets on req.ip. The
  // whole user base therefore shared ONE 300-req/min bucket: a load test from a single client
  // got 0 successful responses out of 23,623, and any one visitor could lock out the rest.
  //
  // Named subnets rather than a hop count: only a proxy on loopback or a private/docker network
  // is believed, so a public client that invents its own X-Forwarded-For is not — Express takes
  // the right-most address that is NOT in a trusted range, which is the one the real proxy
  // appended. A hop count would have to be re-tuned every time the proxy chain changes.
  app.set('trust proxy', 'loopback, uniquelocal');

  // Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, etc).
  // crossOriginResourcePolicy can stay at helmet's strict 'same-origin' default now that this
  // app serves no static files at all: the logo the admin UI previews comes from a presigned S3
  // URL on the bucket's own origin, which this header does not govern.
  app.use(helmet());
  app.use(requestIdMiddleware);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Explicit origins only. This API is credentialed (the refresh token is an httpOnly cookie),
  // and a wildcard is both rejected by browsers alongside credentials: true and wrong here.
  // FRONTEND_URL may list several comma-separated origins so a Cloudflare Pages preview domain
  // can be allowed alongside the production one without a code change.
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3004')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    // Lets the frontend read the rate-card generation metadata off a binary PDF response (see
    // AdminRateCardsController.generate) — browsers hide all custom response headers from
    // fetch()/XHR unless the server explicitly exposes them here.
    exposedHeaders: [
      'X-Rate-Card-Id',
      'X-Rate-Card-Version',
      'X-Total-Count',
      'X-Request-Id',
      // Without this every spreadsheet and PDF download falls back to a filename the client
      // invents, because fetch() hides Content-Disposition on a cross-origin response.
      'Content-Disposition',
    ],
  });

  await app.listen(process.env.PORT ?? 4000);
}

/**
 * How many worker processes to run. One Node process executes JavaScript on ONE core however
 * many the box has, and measurement put a single process at ~520 req/s on a cached read and
 * ~190 req/s on a database read before latency ran away.
 *
 * Defaults to 1 — the behaviour this has always had — because every worker opens its own Prisma
 * connection pool (Prisma's own default is cores*2+1), and forking blindly on a many-core host
 * is how a Postgres with the stock max_connections=100 starts refusing connections. Set
 * WEB_CONCURRENCY to the number of cores the box actually has, and size the pool with
 * ?connection_limit= on DATABASE_URL so workers * connection_limit stays under max_connections.
 *
 * The BullMQ notification worker is safe to run in every process: a queue hands each job to
 * exactly one consumer, and nothing here registers a repeatable/cron job that N processes could
 * each schedule.
 */
function workerCount(): number {
  const configured = Number(process.env.WEB_CONCURRENCY);
  if (!Number.isInteger(configured) || configured < 1) return 1;
  return Math.min(configured, availableParallelism());
}

const workers = workerCount();
if (workers > 1 && cluster.isPrimary) {
  // The primary accepts nothing itself; it owns the listening socket and hands connections to
  // the workers, and replaces any that dies so a crash costs one in-flight request, not the API.
  for (let i = 0; i < workers; i += 1) cluster.fork();
  cluster.on('exit', (worker, code, signal) => {
    console.error(
      `[cluster] worker ${worker.process.pid} exited (code=${code} signal=${signal}) — restarting`,
    );
    cluster.fork();
  });
} else {
  void bootstrap();
}
