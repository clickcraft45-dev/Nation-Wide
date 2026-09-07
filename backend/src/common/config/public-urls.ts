import type { ConfigService } from '@nestjs/config';

/**
 * The single public origin to build user-facing links against — OAuth redirects, password-reset
 * links, the review link in the operations alert.
 *
 * This exists because FRONTEND_URL is deliberately a comma-separated ALLOW-LIST for CORS (see
 * main.ts), so a Cloudflare preview domain can be permitted alongside production. Interpolating
 * that list straight into a URL produced links like
 *
 *   http://localhost:3004,https://nationwidelogistics.co,https://www.nationwidelogistics.co/login
 *
 * which is not a URL at all. An allow-list and a canonical address are different things and are
 * now different settings.
 *
 * Resolution order: PUBLIC_FRONTEND_URL when set, otherwise the first entry of FRONTEND_URL that
 * is not localhost (so an existing deployment that never sets the new variable still produces a
 * reachable link rather than pointing customers at their own machine), otherwise the first entry.
 * Any trailing slash is stripped so callers can append "/path" unconditionally.
 */
export function publicFrontendUrl(config: ConfigService): string {
  const explicit = config.get<string>('PUBLIC_FRONTEND_URL')?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const candidates = (
    config.get<string>('FRONTEND_URL') ?? 'http://localhost:3004'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const remote = candidates.find(
    (origin) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(origin),
  );

  return (remote ?? candidates[0] ?? 'http://localhost:3004').replace(
    /\/+$/,
    '',
  );
}
