# Deployment Guide

## Prerequisites

- PostgreSQL 16+ (managed or self-hosted)
- Redis 7+ (managed or self-hosted)
- Node 20+ if not deploying via Docker
- Real credentials for: JWT signing secrets, ICL Tracking API (`ICL_API_USER_ID`/`ICL_API_PASSWORD`),
  and WhatsApp/Meta webhook verification, once those integrations go live for the target environment

## Test deploy: Vercel (frontend) + Railway (backend)

Recommended path for a pre-production test deploy reachable from multiple devices, before
pointing the real domain at anything. **The backend does not belong on Vercel** — it runs a
BullMQ worker (`notifications.processor.ts`) that needs a persistent, always-running process to
poll Redis, which Vercel's stateless serverless functions can't provide. Railway (or Render/
Fly.io/a VPS — anything that runs the existing `apps/backend/Dockerfile` as a long-lived
container) is what the worker needs.

### 1. Backend on Railway

1. New Railway project → deploy from this GitHub repo. Railway auto-detects `railway.json` at
   the repo root, which points it at `apps/backend/Dockerfile` with the repo root as build
   context (required — the backend depends on the `packages/shared-types` workspace, same as the
   Docker Compose setup).
2. Add Railway's Postgres and Redis plugins to the project — they inject `DATABASE_URL`/
   `REDIS_URL` automatically; no manual connection-string wiring needed.
3. Set the remaining required env vars on the service (see [`ENV_VARS.md`](./ENV_VARS.md) for the
   full list) — at minimum real (non-dev-default) `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
   (e.g. `openssl rand -base64 32` for each), `JWT_ACCESS_EXPIRES_IN=15m`,
   `JWT_REFRESH_EXPIRES_IN=7d`. Leave `FRONTEND_URL` unset for now — set it after step 2 gives you
   the Vercel URL. Railway injects its own `PORT`; the app already listens on
   `process.env.PORT ?? 4000`, nothing to configure.
4. After the first successful deploy, run the release steps once against the new database (via
   `railway run`, or a one-off shell from the Railway dashboard):
   ```bash
   railway run npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
   railway run npm run db:seed --workspace=apps/backend
   ```
   Set `SEED_ADMIN_PASSWORD`/`SEED_PICKUP_PARTNER_PASSWORD` to something other than the
   `ChangeMe123!` default first (see [Seeding](#seeding) above) — this is a real, internet-
   reachable deploy, not local-only.
5. Note the public URL Railway assigns the service (Settings → Networking → Generate Domain if
   one isn't already there) — you'll need it in step 2.

### 2. Frontend on Vercel

1. Import this repo as a new Vercel project. Set **Root Directory** to `apps/frontend` in the
   project settings — `apps/frontend/vercel.json` (already in the repo) handles the rest: it
   builds `packages/shared-types` before `next build`, since that workspace package isn't
   published to npm and Next.js won't compile it on its own.
2. Set the env var `NEXT_PUBLIC_API_BASE_URL` to the Railway URL from step 1.5, plus `/api/v1`
   (e.g. `https://your-service.up.railway.app/api/v1`). This is inlined at *build* time — if you
   change it later, redeploy, don't just restart.
3. Deploy. Note the `*.vercel.app` URL Vercel assigns.

### 3. Close the loop

Go back to Railway and set `FRONTEND_URL` to the Vercel URL from step 2.3, then redeploy/restart
the backend service so CORS and the post-login redirects (see below) pick it up.

If you also want to test Google sign-in in this environment: set `GOOGLE_CALLBACK_URL` on Railway
to `<railway-url>/api/v1/auth/google/callback`, and add that exact URL as an Authorized redirect
URI on the Google OAuth client (see the [Google sign-in](#google-sign-in) section below) — a
second entry alongside the localhost one, not a replacement for it.

## Building the images

Both apps are containerized. **Build context must be the monorepo root** — both Dockerfiles
depend on `packages/shared-types`, which lives outside `apps/*`:

```bash
docker build -f apps/backend/Dockerfile -t nationwide-backend:latest .
docker build -f apps/frontend/Dockerfile -t nationwide-frontend:latest .
```

Or use the provided `docker-compose.yml`, which builds and wires both services together with
Postgres/Redis:

```bash
docker compose up --build
```

The backend image is `node:20-bookworm-slim` (not alpine) deliberately — `sharp` and `bcrypt`
ship native bindings that need glibc; alpine's musl libc causes native-module ABI mismatches.

The frontend image uses Next.js's `output: "standalone"` build (see `apps/frontend/next.config.ts`)
so the runtime image only ships the node_modules that app actually needs, not the whole
monorepo's.

## Running database migrations

Migrations are **not** run automatically by the backend container on startup — run them as an
explicit deploy step, before starting new backend instances:

```bash
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
```

`migrate deploy` (not `migrate dev`) is the production-safe command: it applies pending
migrations without generating new ones or prompting.

## Seeding

```bash
npm run db:seed --workspace=apps/backend
```

Idempotent for the core seed data (admin user, pickup partner, shipping provider, tracking
statuses, rate providers, countries, one demo shipment) — safe to run on every deploy. Set
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (and `SEED_PICKUP_PARTNER_EMAIL`/`_PASSWORD`) to
anything other than the defaults before running this against a real environment — the defaults
(`ChangeMe123!`) are dev-only.

Do **not** set `SEED_BULK_DEMO_DATA=true` outside a disposable local/staging database — it
generates ~60 fake customers and ~400 fake orders (for pagination/perf testing), appended (not
upserted) on every run.

## Environment variables

See [`ENV_VARS.md`](./ENV_VARS.md) for the full reference. At minimum, a production deploy needs
real (non-default) values for `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, and `FRONTEND_URL` (used for CORS).

### Google sign-in

Optional — the app runs fine without it (`GoogleConfiguredGuard` returns a clean 503 on
`/auth/google*` until it's configured). To enable it in a given environment:

1. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google Cloud Console → APIs & Services →
   Credentials) and `GOOGLE_CALLBACK_URL` (that environment's public backend URL +
   `/api/v1/auth/google/callback`).
2. Add that same callback URL as an "Authorized redirect URI" on the Google OAuth client — the
   value must match exactly, including scheme and path. One client can list both the localhost
   and production callback URLs, or use separate clients per environment.
3. `FRONTEND_URL` must already be correct for that environment (see above) — it's what
   `/auth/google/callback` redirects back to on both success and failure.

Google sign-in only ever authenticates/creates Customer accounts — a Google email matching an
existing STAFF/ADMIN/PICKUP_PARTNER account is rejected by design (see
`AuthService.loginOrPrepareGoogleSignup`).

## Health checks

`GET /api/v1/health` (unauthenticated) checks Postgres (`SELECT 1`) and Redis (`PING`) in
parallel, returning `200` with `{status: "ok", checks: {database, redis}}` when both are
reachable, `503` otherwise. Both Dockerfiles declare a `HEALTHCHECK` against this endpoint
(backend) and `/` (frontend) — point your orchestrator's readiness/liveness probe at the same
endpoint rather than reimplementing the check.

## Backup / restore

No application-level backup tooling exists — back up Postgres using your hosting provider's
standard mechanism (e.g. `pg_dump`/managed automated snapshots). The one non-database piece of
state is `apps/backend/storage/uploads/` (uploaded company logos) — include it in your backup plan
if you're not running on ephemeral storage, or move it to object storage (S3-compatible) before a
production deploy, since the container filesystem is not persisted across restarts/redeploys as
configured today.

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`: install → build shared-types →
generate Prisma client → `migrate deploy` against a Postgres service container → lint → unit
tests (backend + frontend, `--workspaces --if-present` picks up both automatically) → backend
e2e tests → build both apps → seed → a production-runtime smoke test (boots the built backend,
hits `/api/v1` and `/api/v1/tracking/NW-DEMOTRACK1`) → `npm audit --audit-level=high`, which
**blocks the merge** on any high/critical finding (security-audit fix INFRA-2) — there is no
`continue-on-error` escape hatch; a new high/critical advisory needs a real dependency bump or
resolution, not a CI config change, to get past this gate. The two GitHub Actions this workflow
uses are pinned to commit SHAs rather than the floating `v4` tag (INFRA-4) — bump them by
re-resolving the tag's current SHA (`git ls-remote --tags https://github.com/<org>/<repo> v4`),
not by hand-editing the hash.

Not yet wired into CI: building/pushing the Docker images themselves, or deploying anywhere — add
an image-build-and-push step (and your platform's deploy step) once a target environment is
chosen.

## Database access

Every environment's `DATABASE_URL` should connect as a dedicated, least-privilege role — never
the Postgres instance superuser (INFRA-5). The local `docker-compose.yml` connects as the
official Postgres image's default init user for dev-only convenience; that is **not** a template
for production. On a managed Postgres provider (Railway, RDS, Cloud SQL, etc.), create a scoped
role explicitly rather than relying on whatever default the provisioning flow hands you:

```sql
CREATE ROLE nationwide_app WITH LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT ALL PRIVILEGES ON SCHEMA public TO nationwide_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nationwide_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nationwide_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nationwide_app;
```

Before go-live, confirm what the production `DATABASE_URL` actually connects as:

```sql
SELECT current_user, usesuper FROM pg_user WHERE usename = current_user;
-- usesuper must be false
```

## Auth audit trail

Login/logout/registration/password-change events are structured `AuthService` logger output
(`event: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | ...`, see `AuthService.audit()`), not rows
in the `AuditLog` table — that table is hard-FK'd to `AdminUser` and scoped to staff business-
mutation actions (rate changes, payment updates, pickup-request lifecycle), so it structurally
can't represent a `CUSTOMER` login without a schema change. This is a deliberate tradeoff, not an
oversight (INFRA-6) — but it means the audit trail for logins/failed-login patterns is **only as
durable as your log pipeline**. Before production go-live, confirm your hosting platform actually
captures and retains backend stdout (container log aggregation is standard on Railway/most
container platforms, but isn't automatic everywhere) — without that, `LOGIN_FAILED` bursts
(credential stuffing) are invisible after the fact even though they're logged in real time.
There is currently no admin-role-change feature in the app (`AdminUser.role` is set once at
creation and not editable via any endpoint), so there is nothing yet for a `ROLE_CHANGED` audit
event to record — add one alongside that feature if/when it ships.

## Rolling back

Standard stateless-service rollback: redeploy the previous image tag. The one thing to check
first — whether the previous migration is still compatible with the current schema. This
project's migrations have not been audited for backward-compatibility (no expand/contract
pattern enforced), so a rollback that also needs a migration rollback is a manual, careful
operation: restore the pre-migration `migrations` table state and database backup together,
don't just redeploy old code against a newer schema.
