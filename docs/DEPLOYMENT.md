# Deployment Guide

## Prerequisites

- An AWS account (the backend runs on one EC2 instance) and a Cloudflare account (the frontend runs on Cloudflare Pages)
- PostgreSQL 14+ installed on the EC2 host (already present) — it is NOT a container and is not duplicated in compose
- Redis 7, which does run as a container via `docker-compose.yml`
- A private S3 bucket (`nationwide-logistics-s3`) and an EC2 instance role (`nantionwides3`) that can read/write it
- Node 20+ if not deploying via Docker
- Real credentials for: JWT signing secrets, ICL Tracking API (`ICL_API_USER_ID`/`ICL_API_PASSWORD`),
  and WhatsApp/Meta webhook verification, once those integrations go live for the target environment

## Deploy: EC2 (backend) + Cloudflare Pages (frontend)

**The backend cannot go on Pages or any serverless platform.** It runs a BullMQ worker
(`notifications.processor.ts`) that polls Redis from a persistent, always-running process.
Cloudflare Pages Functions and Workers are request-scoped and cannot host it. One EC2 instance
running the existing `docker-compose.yml` is what the worker needs.

PostgreSQL runs on the instance itself and Redis runs as a container bound to `127.0.0.1`.
Nothing outside the box ever connects to either. Files do not live on the instance at all —
invoice PDFs, company logos and rate-card PDFs go to S3, so they survive a rebuild, a
container recreation and a full redeploy.

### 1. Backend on EC2

1. **Launch the instance.** Ubuntu 24.04 LTS, `t3.small` or larger (`t3.micro`'s 1 GB RAM is not
   enough to run Postgres, Redis and a Node build at once). Attach an Elastic IP so the address
   survives a stop/start.

2. **Security group — this is the part that matters.** Inbound: `443` and `80` from anywhere,
   `22` from your own IP only. **Do not open `5432`, `6379` or `4000`.** Postgres listens on the
   host, Redis and the backend publish on `127.0.0.1` only, and Nginx/Caddy is the single public
   entry point — but an open port plus a future config change is how databases end up ransomed.

   The instance also needs the **`nantionwides3` IAM role attached** (Actions → Security →
   Modify IAM role). That role is how the backend gets S3 credentials; there are no access keys
   anywhere in the app.

3. **Install Docker and clone:**
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker $USER && newgrp docker
   git clone https://github.com/clickcraft45-dev/Nation-Wide.git && cd Nation-Wide
   ```

4. **Create the env file.** Copy `backend/.env.example` to `backend/.env` and set real
   values (see [`ENV_VARS.md`](./ENV_VARS.md)). At minimum, generate real signing secrets —
   the dev defaults must never reach an internet-reachable deploy:
   ```bash
   cp backend/.env.example backend/.env
   openssl rand -base64 32   # JWT_ACCESS_SECRET
   openssl rand -base64 32   # JWT_REFRESH_SECRET
   ```
   Set `PUBLIC_BASE_URL` to the backend's real public origin (e.g.
   `https://api.nationwidelogistics.co`) — see [Invoices](#invoices) for why an internal AWS
   hostname breaks WhatsApp attachments. Leave `FRONTEND_URL` until step 2 gives you the Pages
   URL. `DATABASE_URL` and `REDIS_URL` are overridden by compose, so their values in this file
   only affect running the backend natively on the box.

5. **Create the database and role** on the host's existing PostgreSQL, if not already done:
   ```bash
   sudo -u postgres createuser --pwprompt nationwide
   sudo -u postgres createdb --owner=nationwide nationwide
   ```
   Confirm Postgres is listening on loopback only (`ss -lntp | grep 5432` should show `127.0.0.1`
   and not `0.0.0.0`), then put the resulting URL in `backend/.env` as `DATABASE_URL`, using
   `host.docker.internal` as the host so the backend container can reach it.

6. **Start the stack:**
   ```bash
   docker compose up -d --build
   docker compose ps   # backend and redis; there is no database container
   ```

7. **Run the release steps once** against the database:
   ```bash
   docker compose exec backend npx prisma migrate deploy --schema backend/prisma/schema.prisma
   docker compose exec backend npm run db:seed --workspace=backend
   ```
   `migrate deploy` (not `migrate dev`) is the production-safe command: it applies the committed
   migrations and never generates or prompts. Set `SEED_ADMIN_PASSWORD` and
   `SEED_PICKUP_PARTNER_PASSWORD` to something other than the `ChangeMe123!` default first (see
   [Seeding](#seeding)) — this is a real, internet-reachable deploy.

8. **Put TLS in front of it.** Point an `api.` DNS record at the Elastic IP. Either terminate TLS
   with Caddy/nginx on the box, or proxy the record through Cloudflare (orange cloud) with SSL
   mode **Full (strict)**. If you proxy `/api/*` through Cloudflare, read the caching warning in
   [Invoices](#invoices) first — it is not optional.

### 2. Frontend on Cloudflare Pages

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Build settings:
   - **Framework preset:** Next.js
   - **Build command:** `npm run build --workspace=packages/shared-types && npm run build --workspace=frontend`
   - **Build output directory:** `frontend/.next`
   - **Root directory:** leave as the repo root — `packages/shared-types` is an unpublished
     workspace package, so a build rooted at `frontend` cannot resolve it.
3. Set the env var `NEXT_PUBLIC_API_BASE_URL` to the backend origin from step 1.8 plus `/api/v1`
   (e.g. `https://api.nationwidelogistics.co/api/v1`). This is inlined at **build** time — after
   changing it, redeploy; a restart will not pick it up.
4. Deploy, and note the `*.pages.dev` URL.

### 3. Close the loop

On the EC2 box, set `FRONTEND_URL` in `backend/.env` to the Pages URL from step 2.4, then
`docker compose up -d backend` so CORS and the post-login redirects pick it up.

For Google sign-in in this environment: set `GOOGLE_CALLBACK_URL` to
`<backend-origin>/api/v1/auth/google/callback` and add that exact URL as an Authorized redirect
URI on the Google OAuth client (see [Google sign-in](#google-sign-in)) — a second entry
alongside the localhost one, not a replacement.

## Building the images

Both apps are containerized. **Build context must be the monorepo root** — both Dockerfiles
depend on `packages/shared-types`, which lives outside `apps/*`:

```bash
docker build -f backend/Dockerfile -t nationwide-backend:latest .
docker build -f frontend/Dockerfile -t nationwide-frontend:latest .
```

Or use the provided `docker-compose.yml`, which builds the backend and wires it to Redis.
It contains no database service — Postgres is the host's:

```bash
docker compose up --build
```

The backend image is `node:20-bookworm-slim` (not alpine) deliberately — `sharp` and `bcrypt`
ship native bindings that need glibc; alpine's musl libc causes native-module ABI mismatches.

The frontend image uses Next.js's `output: "standalone"` build (see `frontend/next.config.ts`)
so the runtime image only ships the node_modules that app actually needs, not the whole
monorepo's.

## Running database migrations

Migrations are **not** run automatically by the backend container on startup — run them as an
explicit deploy step, before starting new backend instances:

```bash
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

`migrate deploy` (not `migrate dev`) is the production-safe command: it applies pending
migrations without generating new ones or prompting.

## Seeding

```bash
npm run db:seed --workspace=backend
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

`GET /api/v1/health` (unauthenticated) checks PostgreSQL (`SELECT 1`) and Redis (`PING`) in
parallel. **Only the database decides the status code.** Redis is a cache that fails open (see
`redis.service.ts`), so a Redis outage returns `200` with `{status: "degraded", checks: {database:
"ok", redis: "error"}}` — the app is still serving every request correctly. A `503` means the
database is unreachable. This matters: returning `503` for a dead cache made every probe wired to
this endpoint kill and restart a healthy container, turning a cache blip into a crash loop. Alert
on `status: "degraded"`, but never restart on it. Both Dockerfiles declare a `HEALTHCHECK` against this endpoint
(backend) and `/` (frontend) — point your orchestrator's readiness/liveness probe at the same
endpoint rather than reimplementing the check.

## GST invoicing

Invoices are a statutory record, so the deployment has three hard requirements beyond the usual:

1. **`PUBLIC_BASE_URL` must be the backend's real public origin** (e.g.
   `https://api.nationwidelogistics.co`), never an internal AWS hostname or an ALB DNS name.
   WhatsApp attachments work by handing Meta a URL that *Meta's own servers* fetch, so an origin
   only reachable inside your VPC produces messages with an attachment nobody can open.
2. **`storage/invoices/` must survive a redeploy.** Invoice PDFs are rendered once at issue time
   and served from disk forever after — re-rendering could produce a different document from the
   one the customer already filed. On ECS/Fargate or any container with an ephemeral filesystem
   this means an EFS mount (or moving the store to S3); a plain container restart otherwise
   silently loses every invoice PDF ever issued while leaving the database rows behind. Back it
   up alongside `storage/logos/`.
3. **Cloudflare must not cache the public invoice route.** `/api/v1/public/invoices/:id/:token` is
   deliberately unauthenticated — protected by an unguessable HMAC in the path — and the backend
   sends `Cache-Control: private`. Confirm no Cache Rule or "Cache Everything" Page Rule overrides
   that for `/api/*`, or Cloudflare's shared edge cache could serve one customer's invoice to
   another.

Before the first generate, set the company GST identity (GSTIN, legal name, registered state +
state code, SAC) in Admin → Settings. `InvoicesService` refuses to issue until all are present
rather than emitting a document with statutory blanks.

### WhatsApp delivery (Gupshup)

The WABA is onboarded through **Gupshup**, a BSP — not Meta's Cloud API directly. Outbound sending
needs `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE_PHONE` and `GUPSHUP_APP_NAME`; with any one missing the
app falls back to the stub adapter, which logs at WARN and delivers nothing. **The boot log states
which adapter is live** — check it after any change.

**Messages are sent free-form, not as approved templates.** The wording lives in
`notifications/message-bodies.ts` and ships like any other code, with no Meta approval step.

> **The constraint this buys.** WhatsApp only permits free-form ("session") messages inside the
> **24-hour customer service window** — the 24 hours after the *customer's* own last message to
> this number. Outside that window the platform accepts only approved templates and rejects the
> send, which surfaces as a Gupshup error, gets retried by the queue, and lands as a `FAILED`
> notification. So free-form works for customers mid-conversation and does **not** work for a
> customer who has never messaged you or last did so days ago — which describes most invoice
> recipients. Expect invoice sends to fail for cold contacts until a template is approved.
>
> This is easy to miss in testing, because the person testing has just messaged the number and is
> inside their own 24-hour window.

`GUPSHUP_TEMPLATES` is optional and currently unset. Adding an entry makes that one notification
use an approved template instead — no code change — and templates work at any time, in or out of
the window. The `params` order is not optional: Gupshup takes a positional array while the app
passes named variables, so a wrong order silently puts the amount where the customer's name
belongs. An invoice template must be approved with a **DOCUMENT header**.

**Known gap — delivery receipts.** `WhatsAppWebhookController` implements Meta's Cloud API callback
contract: the `hub.challenge` handshake, an `X-Hub-Signature-256` HMAC keyed with the Meta App
Secret, and the `entry[].changes[].value.statuses[]` payload shape. Gupshup posts its own callback
format to a URL configured in the Gupshup dashboard and does not sign with that header, so nothing
currently reaches `recordDeliveryStatus`. Notifications sit at `SENT` and never progress to
`DELIVERED`/`READ`/`FAILED`. Sending is unaffected. A Gupshup-shaped callback endpoint is still to
be written; `WHATSAPP_WEBHOOK_VERIFY_TOKEN`/`WHATSAPP_APP_SECRET` only serve the existing
Meta-shaped route.

## Backup / restore

No application-level backup tooling exists, and self-hosting Postgres means **nobody is taking
snapshots for you**. Schedule a `pg_dump` on the instance and copy it off the box:

```bash
# ~/backup-db.sh — chmod 700. Reads the password from ~/.pgpass (chmod 600), never from this file
# and never from the command line, where it would be visible in `ps` and in shell history.
set -euo pipefail
STAMP=$(date +%F)
pg_dump --format=custom --host=127.0.0.1 --username=nationwide nationwide \
  > "/tmp/nationwide-$STAMP.dump"
aws s3 cp "/tmp/nationwide-$STAMP.dump" "s3://your-backup-bucket/postgres/"
rm -f "/tmp/nationwide-$STAMP.dump"
```

Put that in a cron job, and take EBS snapshots of the volume as a second line of defence. Restore
with `pg_restore --clean --if-exists --dbname=nationwide <file>`.

**Do not put the database password in the script**, in cron, or in any file that reaches git — use
`~/.pgpass`, or a peer-authenticated local socket. The S3 copy needs no credentials: the instance
role covers it.

Application files need no backup plan of their own: they are in S3, which is already durable and
versionable. Enable bucket versioning if you want protection against an accidental delete.

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`: install → build shared-types →
generate Prisma client → `migrate deploy` against a throwaway PostgreSQL service container → lint → unit
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

The database runs unauthenticated on loopback (INFRA-5), so `DATABASE_URL` carries no credential
to leak. That trades a credential boundary for a network one, which holds only as long as the
network boundary does:

The database listens on `127.0.0.1` inside the EC2 instance and is never exposed to the
internet, so network reachability — not a credential — is the outer perimeter here:

- **Keep `5432` out of the security group.** Postgres should listen on `127.0.0.1` only
  (`ss -lntp | grep 5432`); the backend container reaches it via `host.docker.internal`, which
  resolves to the host's own loopback, not a public interface.
- **Use a dedicated, least-privilege role.** `DATABASE_URL` should connect as `nationwide`, owner
  of that one database — never as `postgres` or another superuser. A leaked app credential should
  not be able to read other databases or drop the cluster.
- **The password is a real secret.** It lives only in `backend/.env` on the instance (gitignored)
  and in `~/.pgpass` for backups. It must never appear in a committed script, in a command line
  (visible in `ps`), or in application logs — `PrismaService` never logs the connection string.
- **SSH is the real attack surface.** Restrict `22` to your own IP, use key auth only, and keep
  the instance patched.
- **`backend/.env` on the instance holds every secret.** Keep it out of AMIs and snapshots you
  share.

CI never touches a deployed database — it runs its own throwaway PostgreSQL service container.

## Auth audit trail

Login/logout/registration/password-change events are structured `AuthService` logger output
(`event: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | ...`, see `AuthService.audit()`), not rows
in the `AuditLog` table — that table is hard-FK'd to `AdminUser` and scoped to staff business-
mutation actions (rate changes, payment updates, pickup-request lifecycle), so it structurally
can't represent a `CUSTOMER` login without a schema change. This is a deliberate tradeoff, not an
oversight (INFRA-6) — but it means the audit trail for logins/failed-login patterns is **only as
durable as your log pipeline**. Before production go-live, confirm your hosting platform actually
captures and retains backend stdout (on a single EC2 instance this means configuring the
CloudWatch agent or a `docker compose` logging driver — nothing captures stdout by default) — without that, `LOGIN_FAILED` bursts
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

## S3 file storage

Invoice PDFs, company logos and rate-card PDFs are stored in the private bucket
`nationwide-logistics-s3`, never on the instance filesystem. `backend/storage/` no longer exists.

| What | Key prefix |
|---|---|
| Invoice PDFs | `invoices/<year>/<month>/<invoice-number>.pdf` |
| Company logos | `uploads/company-logos/<settings-id>/<uuid>.<ext>` |
| Rate-card PDFs | `rate-cards/<provider-id>/v<version>-<uuid>.pdf` |

**Credentials.** There are none in the app. `StorageService` constructs an `S3Client` with only a
region; on EC2 the SDK's default provider chain reads the `nantionwides3` instance role. Do not
set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` — the app does not read them and adding them only
creates a long-lived credential to leak. Locally, use `AWS_PROFILE` with a named profile.

**The role needs**, on `arn:aws:s3:::nationwide-logistics-s3/*`: `s3:GetObject`, `s3:PutObject`,
`s3:DeleteObject`.

**Access control.** The bucket keeps Block Public Access on and nothing sets an ACL. Files reach
users two ways, both of which authorise first:

- the authenticated download routes stream the object through the backend after the usual guards;
- `CompanySettingsService.logoUrl` mints a 15-minute presigned URL for the admin UI's `<img>`.

The public invoice link (`/api/v1/public/invoices/:id/:token`) is unchanged: still an HMAC in the
path, still served through the backend, because Meta's servers fetch it with no session. It is not
a presigned S3 URL and the bucket is not reachable directly.

Set `NEXT_PUBLIC_S3_ORIGIN` on the frontend to the bucket's origin
(`https://nationwide-logistics-s3.s3.<region>.amazonaws.com`) or the admin logo preview is blocked
by the frontend's own `img-src` CSP.
