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

# 4. run the initial migration (already applied if you're continuing this repo)
cd apps/backend && npx prisma migrate dev

# 5. run both apps
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

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

Phase 1 (Foundation) complete: monorepo scaffold, Docker Compose, CI skeleton, base apps deployed
to staging is pending. Core Prisma schema (Section 10 entities) is in place and migrated.

Next: Phase 2 (Authentication).
