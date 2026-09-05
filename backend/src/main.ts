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
    ],
  });

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap(); 
