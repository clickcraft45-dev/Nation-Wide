import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  // A fresh checkout won't have storage/logos yet (it's gitignored) — created eagerly so both
  // static serving below and the logo upload endpoint can rely on it always existing.
  mkdirSync(join(process.cwd(), 'storage', 'logos'), { recursive: true });

  // rawBody: true makes Nest's body-parser stash the raw request Buffer on req.rawBody in
  // addition to the parsed JSON body — needed by the WhatsApp webhook handler to compute an
  // HMAC over the exact bytes Meta signed (see WhatsAppWebhookController).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, etc).
  // crossOriginResourcePolicy is relaxed to 'cross-origin' because the frontend (a different
  // origin/port) loads uploaded logo images directly via <img src> from /uploads/* — helmet's
  // default 'same-origin' policy would silently block that image load in the browser.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(requestIdMiddleware);

  // Serves uploaded rate-card assets (company logo) for the admin UI's own <img> preview — the
  // PDF renderer itself never goes over HTTP for the logo, it reads storage/ directly off disk
  // (see RateCardPdfService). Registered before setGlobalPrefix so /uploads/* is never prefixed.
  // process.cwd() (not __dirname) so this resolves the same way in both `nest start --watch`
  // (running from src/) and the compiled `node dist/src/main.js` (both invoked with apps/backend
  // as the working directory).
  //
  // SCOPED TO storage/logos, NOT storage/. Serving the whole storage directory published every
  // rendered tax invoice at /uploads/invoices/<invoice-id>.pdf — unauthenticated, and bypassing
  // the HMAC-signed public route that exists precisely so those PDFs are not reachable by URL
  // alone (see PublicInvoicesController). Only the logo was ever meant to be public, and the
  // path is unchanged: logoPath is "logos/<file>", so CompanySettings' "/uploads/logos/<file>"
  // still resolves. Anything else written under storage/ from now on is private by default.
  app.useStaticAssets(join(process.cwd(), 'storage', 'logos'), {
    prefix: '/uploads/logos',
  });

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3004',
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
