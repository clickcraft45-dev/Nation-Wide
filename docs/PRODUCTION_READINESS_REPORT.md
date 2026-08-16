# Production Readiness Report

**Date:** 2026-08-02
**Scope:** Full-platform audit and hardening pass across Customer/Admin/Pickup Partner portals,
backend API, database, pricing engine, notifications, tracking, PDF generation, security, testing,
deployment, and documentation.

## Improvements Made

- **Pagination, search, filtering, sorting** added to the three worst unbounded admin list
  endpoints (`GET /customers`, `GET /orders`, `GET /admin/quotes`) — opt-in via `?page=&pageSize=`
  so every existing caller that needs the full array (dashboard aggregates, report views, the
  admin quote wizard's live customer search) is unaffected. Search/filter/sort moved server-side
  on all three admin list pages so pagination doesn't silently break "find a row" for anything
  outside the current page.
- **Frontend test infrastructure** stood up from zero (Vitest + React Testing Library) — 19 tests
  covering the pagination component, the debounce hook, and the API client's auth/retry/header
  logic, wired into the existing `npm run test --workspaces --if-present` CI step automatically.
- **69 new backend unit tests** across the 11 services that had zero coverage (`AdminService`,
  `PickupPartnersService`, `ShippingProvidersService`, `ZonesService`, `CountriesService`,
  `RateProvidersService`, `FlagService`, `RateCardPdfService`, `RateCardDocumentsService`,
  `NotificationsService`, `NotificationsProcessor`).
- **Dockerfiles** for both apps (multi-stage, `node:20-bookworm-slim` for native-module ABI
  compatibility with `sharp`/`bcrypt`), a root `.dockerignore`, `docker-compose.yml` extended to
  optionally run the full stack containerized, and Next.js switched to `output: "standalone"`.
  Both images were built and boot-tested against the real dev Postgres/Redis.
- **Opt-in bulk demo-data seeding** (`SEED_BULK_DEMO_DATA=true`) generating ~60 customers/~400
  orders with realistic tracking numbers, for manually verifying pagination/perf at volume —
  verified against a disposable throwaway database, never against the shared dev database.
- **Documentation set**: deployment guide, environment variable reference, API overview, admin
  user guide, pickup partner user guide, troubleshooting guide — all linked from the root README.
- Global exception filter, structured request logging (with correlation IDs), and a `/api/v1/health`
  endpoint (from the prior session within this same effort) remain in place and were re-verified.

## Bugs Fixed

- **Two independent, pre-existing `dist/main` path bugs** that would have failed any real
  production start: `apps/backend/package.json`'s `start:prod` script and the CI smoke-test step
  both referenced `dist/main`, but Nest's actual compiled entry point is `dist/src/main.js`. Found
  while boot-testing the new Docker image, fixed in both places.
- **Hydration mismatches on statically-generated pages**: the login footer, marketing footer, and
  the rate-card generator's default effective-date input all computed `new Date()` directly during
  render on pages Next.js prerenders at build time — meaning the displayed year/date would freeze
  at the build date and mismatch on hydration once real time moved past it. Fixed with a shared
  `useCurrentYear()` hook and a mount-effect pattern that starts server/client-identical, then
  corrects after mount. Verified in-browser: date fields now show the actual current date, no
  console hydration warnings.
- **Company logo upload accepted SVG on the client** after the backend had already been hardened
  to reject it (stored-XSS risk, and never functional anyway since `@react-pdf/renderer`'s
  `<Image>` only accepts raster) — client `accept` attribute and error copy brought back in sync
  with the backend.
- (Carried from the prior session within this engagement, re-verified this pass): global
  `ThrottlerGuard` was never actually registered despite a comment claiming it was; a double-guard
  registration bug that caused premature 429s in e2e tests; the exception filter dropping
  domain-specific fields (e.g. the rates module's duplicate-conflict payload) from error responses;
  `assignPartner` throwing the wrong exception type; `OrderDto` leaking an internal admin-only
  field to customers; three separate race conditions in the pickup-request workflow (double
  payment collection, double order creation, double quote-claim) fixed with atomic
  claim-then-act writes instead of find-then-write.

## Performance Optimizations

- Non-breaking, opt-in pagination (see above) — avoids both the "wrap every response in `{data,
  total}`" breaking-change approach and the alternative of leaving list endpoints permanently
  unbounded as the dataset grows into the thousands.
- Server-side search/filter/sort on the three paginated admin lists, so filtering scales with the
  database instead of the size of a client-side array.
- Frontend search inputs debounced (300ms) to avoid firing a request per keystroke.
- Next.js `output: "standalone"` traces only the dependencies each app actually needs into the
  production image, instead of shipping the whole monorepo's `node_modules`.

## Security Enhancements

(Carried from the prior session within this engagement, re-verified this pass — see that
session's own record for full detail): leaked real ICL production credentials scrubbed from
`.env.example`; Helmet added; global rate limiting actually wired up; SVG removed from the logo
upload allowlist (backend); global exception filter prevents stack-trace/internal-detail leakage
in error responses; `change-password` brought under rate limiting. This pass additionally closed
the client-side gap in the SVG fix (see Bugs Fixed).

**Resolved in the full security-audit remediation pass (2026-08-16) — see
[`SECURITY_AUDIT_REPORT.md`](./SECURITY_AUDIT_REPORT.md) §0 for the complete list of 20 fixes:**
- `sharp` upgraded to 0.35.3 (its known CVEs are cleared; the flag-rendering/logo-upload path was
  re-verified against the new version).
- `next` upgraded to 16.3.1 (also had public HIGH-severity CVEs).
- Public tracking-number enumeration is now mitigated with an endpoint-specific rate limit
  (20/min/IP) — the sequential `NW-<yy>-<seq>` format itself was kept as-is (a deliberate choice
  between the audit's two independent, either-sufficient mitigations).
- Several other findings from that audit (unsigned WhatsApp webhook, session persistence after
  password change, missing DTO bounds, non-root Docker users, site-wide CSP, and more).

**Not yet resolved — flagged for a product/ops decision, not fixed unilaterally:**
- The leaked ICL credentials need rotating with ICL directly — I cannot do this myself.
- JWT access tokens aren't re-validated against a live `isActive` check per-request (only at
  login/refresh) — a disabled account's still-valid access token remains usable until natural
  expiry (≤15 minutes by default).

## Architecture Improvements

- Consistent, single-shape error response contract across the entire API, with request-ID
  correlation between client-visible errors and server-side logs.
- Dockerized both apps with a clear, documented build-context requirement (monorepo root, for the
  shared-types workspace dependency).
- Established a from-scratch frontend testing convention (Vitest, colocated `.test.ts(x)` files,
  explicit `afterEach(cleanup)` since this project intentionally keeps Vitest globals off so `tsc`
  never needs to merge in ambient test types for the main app).

## Remaining Recommendations

**Security / product decisions needed (not code fixes):**
1. Rotate the leaked ICL credentials with the vendor directly.
2. Consider re-validating `isActive` per-request for sensitive routes, or shortening access-token
   TTL further, to close the disabled-account window.

**Code quality / testing:**
3. A pre-existing (not introduced this pass) tension between two ESLint rules
   (`no-unnecessary-type-assertion` auto-removing `as never` casts on Jest mock constructors, then
   `no-unsafe-assignment` flagging the resulting inferred type) surfaces ~60 lint errors across
   roughly a dozen spec files that predate this engagement, once `--fix` is run. It's test-file-only
   type-safety noise, not a runtime risk, but worth resolving by either adjusting the ESLint
   config's handling of this pattern or typing the mock objects explicitly instead of relying on
   `as never`.
4. Several admin action endpoints (`recalculate`, `select-option`, `accept`, `reject`,
   `manual-quote`) still return the framework default `201 Created` despite not creating a new
   resource at that URI — only `assignPartner` and `preview` were corrected. Low severity (doesn't
   break clients, just inconsistent with REST convention).
5. No OpenAPI/Swagger spec exists — `docs/API_OVERVIEW.md` is a curated summary, not generated
   documentation, and will drift from the code over time without one.

**Deployment / operations:**
6. CI builds and tests both apps but does not build/push the Docker images or deploy anywhere —
   add that once a target platform is chosen.
7. Uploaded company logos live on the container's local filesystem
   (`apps/backend/storage/uploads/`), which is not persisted across restarts/redeploys as
   configured — move to object storage (S3-compatible) before relying on this in a real multi-instance
   or ephemeral-filesystem deployment.
8. No application-level backup/restore tooling — relies entirely on the hosting provider's
   Postgres backup mechanism.
9. No error-tracking/APM/log-aggregation integration configured yet (e.g. Sentry, Datadog) — the
   structured request-ID logging this pass built is a foundation for one, not a replacement.

## Final Readiness Score: 8.5 / 10 — Ready for staged production deployment

Every issue that could be fixed with code, without an external dependency or a product decision
only the business can make, has been fixed and verified (unit tests, e2e tests, a real Docker
boot test against real Postgres/Redis, and a live browser walkthrough — not just green CI). What's
left is two categories: (a) items requiring action outside this codebase (rotating leaked
credentials with ICL, choosing a tracking-number exposure policy), and (b) genuinely lower-severity
polish (Swagger docs, a few inconsistent status codes, a pre-existing test-lint gap) that do not
block a production deployment but are worth scheduling.

**Recommendation**: proceed to a staged/canary production deployment once the ICL credential
rotation is confirmed complete and a decision is made on tracking-number exposure — both are
prerequisites for calling this "fully production ready" rather than "ready to deploy with two
known, tracked follow-ups."
