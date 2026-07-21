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

# 6. run both apps
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

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

Note: this machine also runs an unrelated project's Postgres/Redis containers on the default ports
(5432/6379), so this repo's `docker-compose.yml` maps to 5433/6380 instead. Adjust if that's not the
case in your environment.

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

Next: Phase 5 (Tracking core, built against a stub provider adapter). Phase 6 (real ICL adapter)
is still blocked on full API details from ICL — see `docs/architecture-research.docx` Section 31
for the outstanding checklist.
