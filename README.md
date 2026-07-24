# NationWide Shipping Platform

Customer-facing shipment tracking platform. See [`docs/architecture-research.docx`](docs/architecture-research.docx) for the full architecture research and rationale.

## Stack

- Frontend: Next.js + TypeScript (`apps/frontend`)
- Backend: NestJS + TypeScript, modular monolith (`apps/backend`)
- Database: PostgreSQL via Prisma (`apps/backend/prisma`)
- Cache/Queue: Redis + BullMQ
- Shared types: `packages/shared-types`

## Local development

Requires Docker, Node 20+.

```bash
# 1. start Postgres + Redis
docker compose up -d

# 2. install dependencies
npm install

# 3. set up env files
cp apps/backend/.env.example apps/backend/.env

# 4. run migrations (already applied if you're continuing this repo)
cd apps/backend && npx prisma migrate dev

# 5. seed a dev admin user (admin@nationwide.dev / ChangeMe123! by default)
npm run db:seed

# 6. build shared-types (required before running backend/frontend — see note below)
npm run build --workspace=packages/shared-types

# 7. run both apps
npm run dev           # backend on fixed port 4000, frontend on fixed port 3004
                       # (fails fast with a clear error if either port is already in use —
                       # see scripts/ports.cjs to change the assignment)

# 8. alternative single-app startup
npm run dev:backend   # backend on 4000
npm run dev:frontend  # frontend on 3004, backend API URL is auto-derived from BACKEND_PORT or NEXT_PUBLIC_API_BASE_URL
```

**`packages/shared-types` must be built before `apps/backend` or `apps/frontend` will resolve it
correctly** — its `package.json` points `main`/`types` at compiled `dist/` output, not the raw
`.ts` source. Re-run the build above whenever you change anything under `packages/shared-types/src`.
The root `npm run build` handles this ordering automatically; `npm run dev:*` does not, since Nest's
watch mode and Next's dev server both just read whatever is currently in `dist/`.

All backend routes are versioned under `/api/v1`. Auth: `POST /api/v1/auth/login` (email/password,
returns a short-lived access token and sets an httpOnly refresh cookie), `POST /api/v1/auth/refresh`,
`POST /api/v1/auth/logout`. RBAC via `@Roles(...)` + `JwtAuthGuard`/`RolesGuard` — see
`GET /api/v1/admin/ping` for a working example.

Customers (staff/admin only): `POST /api/v1/customers` (name, phone in E.164, optional
email/address, required `consentSource`), `GET /api/v1/customers`, `GET /api/v1/customers/:id`,
`PATCH /api/v1/customers/:id`.

Orders (staff/admin only): `POST /api/v1/orders` (`customerId`, optional `providerCode` —
defaults to `ICL`) creates an order and auto-creates a linked shipment with a generated internal
tracking number (`NW-XXXXXXXXXX`). `GET /api/v1/orders`, `GET /api/v1/orders/:id`,
`PATCH /api/v1/orders/:id` (status transitions).

Tracking (public, no auth): `GET /api/v1/tracking/:internalTrackingNumber` — cache-first (Redis,
key `tracking:<internal_id>`), falls back to last-known data on provider failure, returns
"Tracking not yet available" (200, not an error) if no carrier tracking number is mapped yet.
Try it locally with the seeded demo shipment: `NW-DEMOTRACK1`.

Admin (staff/admin only, `/admin/*` in the frontend): `GET /api/v1/admin/shipments/:internalTrackingNumber`
(raw + normalized view), `POST .../external-tracking-number` (map/re-map the carrier tracking
number), `POST .../override` (manually correct status — always append-only, invalidates the public
cache immediately), `GET /api/v1/admin/integrations/:providerCode/health` (error rate/latency from
`api_request_logs`), `GET /api/v1/admin/audit-logs`. Frontend pages: `/admin/login`,
`/admin/shipments`, `/admin/integrations`, `/admin/audit-logs`.

Note: this machine also runs unrelated projects' containers on several default ports — Postgres/Redis
on 5432/6379 (another project) and 3000-3003 (a persistent IDE container) — so this repo uses fixed
ports chosen to avoid all of them: backend `4000`, frontend `3004`, Postgres `5433`, Redis `6380`
(see `scripts/ports.cjs` and `docker-compose.yml`). Adjust if that's not the case in your environment.

## Project structure

See Section 14 of the architecture doc. Summary:

```
/apps/frontend        - Next.js app (routes: /, /track, /orders, /admin)
/apps/backend          - NestJS app (modular monolith: auth, customers, orders,
                          shipments, tracking, provider-integration, notifications, admin, jobs)
/packages/shared-types - DTOs/enums shared between frontend and backend
/infrastructure        - Docker, IaC, CI config
/docs                  - architecture doc and future ADRs
/tests                 - e2e and integration tests
```

## Status

Phase 1 (Foundation) complete: monorepo scaffold, Docker Compose, CI skeleton, core Prisma schema
(Section 10 entities) migrated. Staging deployment still pending.

Phase 2 (Authentication) complete: JWT access/refresh tokens with rotation, RBAC guards
(customer/staff/admin), a seeded dev admin user, and a CI pipeline that runs migrations + e2e
tests against a real Postgres service container.

Phase 3 (Customer system) complete: Customer CRUD (staff/admin only), E.164 phone validation,
DPDP-compliant consent capture (`consentGivenAt`/`consentSource` stamped server-side at creation,
never client-supplied).

Phase 4 (Order system) complete: Order module with order-to-shipment linkage — creating an order
validates the customer exists, resolves a shipping provider (defaults to the seeded `ICL` row),
and auto-creates a `Shipment` with a generated, provider-agnostic internal tracking number.

Phase 5 (Tracking core) complete: cache-first Tracking module (Redis, rule-based TTL — short for
active shipments, long for `DELIVERED`), a `ShippingProvider` interface + `ProviderAdapterRegistry`
resolving by `shipping_providers.adapter_class` (the core pattern the whole ICL/DHL/FedEx
swap-without-rewrite design depends on), and a deterministic `StubShippingProviderAdapter` standing
in for ICL until Phase 6. Verified end-to-end in a real browser against the live stack (Postgres +
Redis + NestJS + Next.js), not just via tests.

Phase 7 (Admin dashboard) complete: staff can fully operate the tracking mapping workflow without
touching the DB — map/re-map carrier tracking numbers, manually override status (audit-logged,
append-only, invalidates the public cache immediately), view integration health (error rate/latency
from `api_request_logs`, now actually populated — Phase 5 built the table but nothing wrote to it
until now), and view the audit log. Full Next.js admin UI (login, session restore via the httpOnly
refresh cookie, RBAC-gated `/admin/*` routes) backs the API, verified end-to-end in a real browser.

Two real bugs were caught and fixed doing this the honest way (build → verify in a real browser,
not just green tests): (1) `packages/shared-types` pointed `main`/`types` at raw `.ts` source, which
works for type-only imports (erased at compile time) but breaks at runtime the moment any code
imports a real value from it — exactly what `OverrideTrackingStatusDto` started doing. Fixed by
giving shared-types its own `tsc` build step; CI now also runs a production-runtime smoke test
(`node dist/main.js` + a real request) so this class of bug can't hide behind passing unit/e2e tests
again. (2) The frontend's 401-retry logic would recurse forever if `/auth/refresh` itself returned
401 (e.g. an expired session) — fixed by excluding the refresh endpoint from its own retry handler.

Phase 8 (WhatsApp notifications) complete: a `MessagingProvider` interface + `MessagingAdapterRegistry`
(same swap-without-rewrite pattern as the shipping-provider adapter) resolving a `StubWhatsAppAdapter`
for the `WHATSAPP` channel until real Meta Business/WABA credentials are available. A BullMQ-backed
notifications queue/worker sends templated messages with retry/backoff (3 attempts, exponential),
triggered from order creation (`order_confirmation`) and every tracking-status change — both the
automatic kind (via `TrackingService.persistNewEvents`) and manual staff overrides
(`ShipmentsService.overrideTrackingStatus`) — mapped to per-status templates
(`pickup_confirmation`, `in_transit_update`, `out_for_delivery`, `delivered`, `delivery_exception`).
A `GET/POST /api/v1/webhooks/whatsapp` endpoint (no auth — Meta calls it directly) handles the Meta
verification handshake and delivery-status callbacks, updating `Notification.status`/`deliveredAt`/
`readAt` by `providerMessageId`; unknown or malformed payloads are ignored (200) rather than erroring.

Three genuine production-readiness bugs were found and fixed while building this, not just test
artifacts: (1) BullMQ's `Worker` and `Queue` each hold a Redis connection and each emit an `error`
event (e.g. on a transient Redis blip) — Node's default behavior for an unlistened `error` event is
to crash the whole process, so both now have explicit listeners. (2) The queue's Redis connection
was originally a manually-constructed `ioredis` instance with no NestJS lifecycle hook, so
`app.close()` never disconnected it; fixed by passing plain connection options instead so
`@nestjs/bullmq` manages the connection lifecycle itself. (3) The worker could race against deleted
data (e.g. a notification row removed after being queued) and throw `P2025`; the processor now treats
a missing row as a no-op instead of an error. Verified via a real running server (order creation →
`SENT` with a `stub-wamid-...` id in ~20ms; webhook callback → `DELIVERED`; manual override →
correct per-status template sent) and a dedicated `notifications.e2e-spec.ts` covering the webhook
handshake, both notification trigger paths, and both webhook callback edge cases (unknown id,
malformed payload).

Next: Phase 6 (real ICL adapter) — still blocked on full API details from ICL (endpoint, auth,
exact status schema); see `docs/architecture-research.docx` Section 31 for the outstanding
checklist. Phases 9-11 can proceed in parallel per Section 29.
