# Environment Variable Reference

## Backend (`apps/backend/.env`, see `.env.example`)

| Variable | Required | Default (dev) | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Postgres connection string, e.g. `postgresql://user:pass@host:5432/db?schema=public` |
| `REDIS_URL` | Yes | — | Redis connection string, used for both caching and the BullMQ notifications queue |
| `JWT_ACCESS_SECRET` | Yes | — | Signs short-lived access tokens. Must be a real, unguessable secret in any non-dev environment |
| `JWT_REFRESH_SECRET` | Yes | — | Signs refresh tokens (httpOnly cookie). Must differ from `JWT_ACCESS_SECRET` |
| `JWT_ACCESS_EXPIRES_IN` | Yes | `15m` | Any `ms`-parseable duration string |
| `JWT_REFRESH_EXPIRES_IN` | Yes | `7d` | Any `ms`-parseable duration string |
| `PORT` | No | `4000` | HTTP port the NestJS app listens on |
| `FRONTEND_URL` | Yes | — | Used for CORS `origin` — must exactly match the deployed frontend's origin |
| `TRACKING_PROVIDER_TIMEOUT_MS` | No | `6000` | Live carrier-API call timeout before falling back to last-known tracking data |
| `TRACKING_CACHE_TTL_ACTIVE_SECONDS` | No | `300` | Redis TTL for tracking data on shipments not yet `DELIVERED` |
| `TRACKING_CACHE_TTL_TERMINAL_SECONDS` | No | `86400` | Redis TTL for tracking data on `DELIVERED` shipments |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Yes | — | Shared secret for Meta's webhook verification handshake (one-time GET setup) — must match the value configured in the WABA's webhook settings once one exists |
| `WHATSAPP_APP_SECRET` | Yes | — | Meta App Secret, used to verify the `X-Hub-Signature-256` HMAC on every inbound webhook POST. The webhook rejects any POST with a missing or incorrect signature — set from Meta App Dashboard → Settings → Basic once a real app/WABA exists |
| `ICL_TRACKING_API_URL` | No | ICL's production URL | Only relevant once `shipping_providers.adapter_class` is switched to `ICLShippingProviderAdapter` |
| `ICL_API_USER_ID` | No (until ICL is live) | `changeme` | Real value must come from ICL directly — never commit a real value here |
| `ICL_API_PASSWORD` | No (until ICL is live) | `changeme` | Same as above |
| `SEED_ADMIN_EMAIL` | No | `admin@nationwide.dev` | Seed script only — override before seeding anything beyond local dev |
| `SEED_ADMIN_PASSWORD` | No | `ChangeMe123!` | Seed script only — **must** be overridden outside local dev |
| `SEED_PICKUP_PARTNER_EMAIL` | No | `partner@nationwide.dev` | Seed script only |
| `SEED_PICKUP_PARTNER_PASSWORD` | No | `ChangeMe123!` | Seed script only — must be overridden outside local dev |
| `SEED_BULK_DEMO_DATA` | No | unset (`false`) | Seed script only — set to `true` to additionally generate ~60 customers/~400 orders for pagination/perf testing. **Disposable/local databases only** — appends more data on every run, never upserts |
| `GOOGLE_CLIENT_ID` | No (until Google sign-in is live) | `changeme.apps.googleusercontent.com` | From Google Cloud Console → APIs & Services → Credentials. Without a real value, `GoogleConfiguredGuard` returns a clean 503 on `/auth/google*` rather than the app attempting (and failing) to talk to Google |
| `GOOGLE_CLIENT_SECRET` | No (until Google sign-in is live) | `changeme` | Same Google Cloud Console credential as above |
| `GOOGLE_CALLBACK_URL` | No (until Google sign-in is live) | `http://localhost:4000/api/v1/auth/google/callback` | Must exactly match an "Authorized redirect URI" registered on the Google OAuth client — update both together when the backend's public URL changes (e.g. on deploy) |

A leaked real ICL credential pair was found and scrubbed from `.env.example` during the production
readiness pass (Aug 2026) — if you have an older checkout, regenerate your local `.env` from the
current `.env.example` and rotate those credentials with ICL if you'd used the leaked ones.

## Frontend (`apps/frontend`, build-time + runtime)

| Variable | Required | Default (dev) | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | No | `http://localhost:4000/api/v1` | Backend API origin the frontend calls. `NEXT_PUBLIC_*` vars are inlined at build time — rebuild the image after changing this, setting it at container runtime has no effect |
| `PORT` | No | `3000` | Port `next start` / the standalone `server.js` listens on |

## CI (`.github/workflows/ci.yml`)

CI sets its own throwaway values for all required backend vars (`ci-only-*` secrets, a Postgres/
Redis service container) — nothing there needs to match any real environment's values.
