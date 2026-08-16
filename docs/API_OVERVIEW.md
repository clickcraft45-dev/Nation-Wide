# API Overview

All routes are versioned under `/api/v1`. Auth is JWT-based: a short-lived Bearer access token
(sent via `Authorization: Bearer <token>`) plus an httpOnly refresh cookie
(`POST /api/v1/auth/refresh`) the frontend's API client uses to silently retry once on a 401.
RBAC is enforced per-route via `@Roles(...)` + `JwtAuthGuard`/`RolesGuard` — every route below not
marked "public" requires a valid access token whose role is in the listed set.

This is a curated overview, not a full OpenAPI spec — no `/docs` (Swagger) endpoint exists yet;
see [Remaining Recommendations] in the Production Readiness Report for adding one.

## Auth — `/api/v1/auth`

Public. `POST /register` (customer self-signup), `POST /login`, `POST /refresh`, `POST /logout`,
`PATCH /change-password` (authenticated, any role). Login/register/change-password are rate-limited
(`@Throttle`).

## Customers — `/api/v1/customers`

- `CUSTOMER`: `GET /me`, `PATCH /me` — self-service, always scoped to the JWT subject
- `STAFF`, `ADMIN`: `POST /`, `GET /` (paginated — see below), `GET /:id`, `PATCH /:id`

## Orders — `/api/v1/orders`

- `CUSTOMER`: `GET /me` — the caller's own orders
- `STAFF`, `ADMIN`: `POST /`, `GET /` (paginated, search, status/provider filter, sort — see
  below), `GET /:id`, `PATCH /:id` (status transitions)
- `STAFF`, `ADMIN` (via `admin/orders`): `PATCH /admin/orders/:id/payment` — separate from the
  lifecycle-status PATCH above so payment and status can't cross-write on one body

## Quotes — `/api/v1/quotes` (customer-facing) and `/api/v1/admin/quotes` (staff-facing)

Customer quote flow: `POST /quotes` (create + auto-price via the pricing engine), `GET /preview`,
`GET /quotes/me`, `POST /quotes/:id/select-option`, `POST /quotes/:id/accept`. Staff/admin mirror
of the same flow lives under `/admin/quotes`, plus manual quoting (`manual-quote`) and rejection
(`reject`) for quotes that need human pricing review. `/admin/quotes` GET supports pagination +
search + status filter (see below).

## Pickup requests — customer, partner, and admin surfaces

- `CUSTOMER` (`/pickup-requests`): submit a pickup request against an accepted quote
- `PICKUP_PARTNER` (`/partner/pickup-requests`): the field-executive workflow — view assigned
  pickups, `recalculate` (re-price after physical weight verification), `verify`, `collect-payment`,
  `accept` (generates the real Order/Shipment), `reject`
- `STAFF`, `ADMIN` (`/admin/pickup-requests`): assign a partner, view all requests

## Admin-only modules (all under `/api/v1/admin/*`)

| Path | Roles | Purpose |
|---|---|---|
| `/admin` | STAFF, ADMIN | dashboard summary KPIs |
| `/admin/audit-logs` | STAFF, ADMIN | append-only audit trail, paginated via `limit` |
| `/admin/integrations` | STAFF, ADMIN | per-provider call health (error rate, latency) |
| `/admin/shipments` | STAFF, ADMIN | raw + normalized tracking view, manual status override |
| `/admin/pickups` | STAFF, ADMIN | pickup/warehouse-drop-off scheduling |
| `/admin/pickup-partners` | STAFF, ADMIN | onboard/manage `PICKUP_PARTNER` accounts |
| `/admin/company-settings` | ADMIN only | rate-card branding (logo, tagline, legal text) |
| `/admin/countries`, `/admin/zones`, `/admin/rate-providers`, `/admin/rates` | ADMIN only | pricing engine configuration — everything the quote engine reads is admin-editable, nothing hardcoded |
| `/admin/rate-cards` | ADMIN only | generate/preview/download/delete branded PDF rate cards |

`ADMIN`-only (not `STAFF`) on the pricing/company-settings routes is a deliberate narrower gate
than most other admin routes — pricing and branding changes are more sensitive than day-to-day
operations.

## Public, unauthenticated routes

- `GET /api/v1/tracking/:internalTrackingNumber` — cache-first tracking lookup. **Known risk**:
  internal tracking numbers are sequential (`NW-<yy>-<seq>`), so this endpoint is enumerable —
  see the Production Readiness Report's security findings.
- `GET/POST /api/v1/webhooks/whatsapp` — Meta's verification handshake + delivery-status callbacks
- `GET /api/v1/health` — liveness/readiness probe (Postgres + Redis checks)
- `GET /api/v1/countries` — active countries list, used by the public quote wizard

## Pagination, search, filtering, sorting

Three list endpoints support **opt-in** pagination via `?page=&pageSize=` query params:
`GET /customers`, `GET /orders`, `GET /admin/quotes`. When neither param is passed, the response
is the full unfiltered array exactly as before (existing callers that need every row — dashboard
aggregates, report views — are unaffected). When either is passed, the response body is still a
plain array, but an `X-Total-Count` response header is set so a caller can compute page count.

- `/customers?search=` — matches name/email/phone (case-insensitive)
- `/orders?search=&status=&providerId=&trackingGroup=in-transit|delivered&sortKey=id|customer|status|createdAt&sortDir=asc|desc`
- `/admin/quotes?search=&status=`

## Error responses

Every error response (thrown by a global exception filter) has the shape:

```json
{
  "statusCode": 404,
  "message": "Order 123 not found",
  "error": "NotFoundException",
  "path": "/api/v1/orders/123",
  "timestamp": "2026-08-02T12:00:00.000Z",
  "requestId": "..."
}
```

5xx errors never leak a stack trace or internal detail in the response body — only a generic
"Something went wrong" message, with the real error logged server-side against the same
`requestId` (also returned as an `X-Request-Id` response header) for correlation. Domain-specific
exceptions (e.g. the rates module's duplicate-rate conflict) can add extra fields alongside the
base shape — those are preserved, not stripped.
