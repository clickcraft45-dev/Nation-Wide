# Troubleshooting

## "Cannot find module '@nationwide/shared-types'" (or type errors resolving it)

`packages/shared-types` must be built before `apps/backend` or `apps/frontend` will resolve it —
its `package.json` points `main`/`types` at compiled `dist/`, not raw `.ts` source.

```bash
npm run build --workspace=packages/shared-types
```

`npm run dev` handles this automatically; `npm run dev:backend`/`dev:frontend` (single-app
startup) do not — rebuild manually after changing anything under `packages/shared-types/src`.

## `/api/v1/health` returns 503

The response body tells you which check failed (`checks.database` / `checks.redis`). Most common
causes: `DATABASE_URL`/`REDIS_URL` pointing at the wrong host/port (check for port collisions with
other local projects — this repo intentionally uses non-default ports 5433/6380, see
`docker-compose.yml`), or Postgres/Redis containers not actually running (`docker compose ps`).

## Login fails with "Invalid email or password" for a seeded account

Seeded emails are `admin@nationwide.dev` and `partner@nationwide.dev` by default (override via
`SEED_ADMIN_EMAIL`/`SEED_PICKUP_PARTNER_EMAIL`). Password is `ChangeMe123!` unless
`SEED_ADMIN_PASSWORD`/`SEED_PICKUP_PARTNER_PASSWORD` was set when you ran `npm run db:seed`. If
you've re-seeded with a custom password, the old default no longer works.

## Backend container exits immediately / `MODULE_NOT_FOUND: dist/main`

Nest's compiled entry point is `dist/src/main.js`, not `dist/main.js` — a stale assumption that
existed in both `package.json`'s `start:prod` script and the CI smoke-test step until the Aug 2026
production-readiness pass fixed both. If you're running a custom start command anywhere (a
Dockerfile fork, a Procfile, an orchestrator config), point it at `dist/src/main` /
`node dist/src/main.js`.

## `sharp` fails to install or load its native binding

Only relevant if you're not using the provided Docker images (which pin a glibc base image
specifically for this). If installing directly on a musl-libc system (Alpine, some minimal
containers), `sharp`'s native binary won't load — use a glibc-based image/host, or rebuild `sharp`
for that target per its own install docs.

## Pagination: search doesn't find a row I can see on another page

Search (`?search=`) is server-side and searches the full table, not just the current page — if a
result seems missing, check the applied status/provider filter isn't excluding it, not the page
number.

## Rate limited (429) during local testing / re-running e2e tests quickly

Auth routes (`login`, `register`, `change-password`) are throttled. If you're scripting repeated
logins (e.g. manual load testing), space out requests or use a test account whose throttle window
you're deliberately exhausting on purpose — this is expected behavior, not a bug.

## Rate card PDF generation fails or the company logo doesn't render

`@react-pdf/renderer`'s `<Image>` component only accepts raster images (PNG/JPEG/WebP) — SVG was
removed from the allowed upload mimetypes for exactly this reason (it also never actually
rendered, and allowing SVG upload was a stored-XSS risk). Re-upload the logo as PNG/JPEG/WebP if
an old SVG upload is still on file.

## Flag icons missing on generated rate cards

`FlagService` caches a `null` result per country code after a failed rasterization attempt (not
just successes) — a genuinely-missing flag (unsupported/invalid country code) won't retry on
every subsequent request; that's intentional, not a bug. If a flag should exist but doesn't,
check the country's `code` field is a valid ISO 3166-1 alpha-2 code.

## Pickup partner can't collect payment / "already processed" error

Verification, payment collection, and acceptance are guarded by atomic claim-then-act writes
specifically to prevent double-submission (e.g. two rapid taps, or a retried request after a slow
response) from double-charging or double-creating an order. If you hit "already processed"
unexpectedly, check whether an earlier request actually already succeeded (refresh the pickup
request detail) before assuming it's a bug.

## Docker build is slow / large image

The backend image includes `sharp`'s native bindings and Prisma's query engine, both
inherently large. `.dockerignore` at the repo root already excludes `node_modules`, `dist`,
`.next`, and other build artifacts from the build context — if a build still feels slow, check
your local Docker's build cache wasn't invalidated by an unrelated file change (e.g. editing
`package-lock.json` invalidates the `npm ci` layer for every downstream stage).
