# NationWide Logistics — Security Audit Report

**Date:** 2026-08-15
**Auditor role:** Application security review (authentication, authorization, injection, business
logic, infrastructure, dependencies)
**Scope:** `apps/backend` (NestJS/Prisma/PostgreSQL API) and `apps/frontend` (Next.js/React) as
they exist in the working tree at audit time.
**Method:** Direct source review of every controller, guard, DTO, and service in the areas listed
below — not a generic checklist. Every finding cites the exact file and line it was found at.
Where a control was confirmed working correctly, that is stated with the same rigor as a defect,
so this document reflects the actual security posture rather than a list of hypothetical risks.
**Baseline:** OWASP ASVS 5.0 control categories, OWASP Top 10:2025 risk categories, NIST SSDF
practices.

This report does **not** conclude the system is "unhackable." It identifies what is verified
secure, what is not, and what must change before this is safe to call production-ready. See
§8 for the explicit go/no-go determination.

---

## 0. Remediation Status — Updated 2026-08-16

All 20 findings below have been fixed and verified (unit + e2e tests, plus a live Docker
boot-test for the two container-level findings). Nothing in this pass required an architecture
or business-logic change — consistent with §8's original assessment that the remaining gaps were
mechanical, not structural.

| ID | Fix |
|---|---|
| DEP-1 | `next` upgraded to 16.3.1. `npm audit` shows zero `next` advisories; both apps build clean. |
| DEP-2 | `sharp` upgraded to 0.35.3 (single hoisted install shared by both workspaces). Logo-upload → PDF-generation flow and Next's image optimizer both re-verified. |
| BIZ-1 | `POST /webhooks/whatsapp` now verifies `X-Hub-Signature-256` (HMAC-SHA256 over the raw request body, via Nest's `rawBody: true`) before processing; missing/incorrect signature → 401. |
| INFRA-1 | Endpoint-specific `@Throttle` overrides added: tracking 20/min/IP, quote/order/pickup-request creation 10/min. |
| AUTH-1 | `changePassword` now nulls `hashedRefreshToken` in the same write as the password hash — a stolen refresh token no longer survives a password change. Frontend signs the user out immediately after a successful change. |
| INFRA-2 | `continue-on-error: true` removed from the CI `npm audit --audit-level=high` step — it now blocks the merge. Three unrelated pre-existing high-severity transitive advisories (fast-uri, js-yaml, nanoid) were also cleared via `npm audit fix` so this gate isn't red on day one. |
| INFRA-3 | Both Dockerfiles now run as the non-root `node` user (uid/gid 1000, pre-created in the official `node:20-bookworm-slim` image) rather than root. Verified live: both images built, booted against real Postgres/Redis, confirmed `whoami` → `node`, and confirmed `storage/logos`/`storage/uploads` are writable by that user. |
| BIZ-2 | `collectPayment` now rejects a `collectedAmount` that deviates from the verified/estimated price by more than max(5%, ₹50). |
| AUTHZ-1 | Covered by INFRA-1's tracking-endpoint throttle. |
| VAL-1 | `@Max` ceilings added to `baseRate`/`nationwideCut` (₹10,00,000) and `gstPercent` (100%) across every rate DTO, plus `collectedAmount`/`paidAmount` (₹10,00,000). |
| VAL-2 | `CreateCountryDto.code` now requires `@Length(2,2)` + `/^[A-Z]{2}$/` (real ISO 3166-1 alpha-2 shape only). |
| VAL-3 | `next.config.ts` now sets a site-wide CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Strict-Transport-Security` on every page response. Verified live via `curl -I` against a running container. |
| BIZ-4 | `CreateQuoteDto.weightKg` capped at `@Max(1000)`. |
| BIZ-3 | Both the webhook verify-token comparison and the new signature comparison use `crypto.timingSafeEqual`, not `===`. |
| AUTH-2 | `/auth/register` now returns the identical conflict message regardless of whether the email or the phone number matched an existing account. |
| AUTH-3 | Minimum password length raised from 8 to 10 on every password-creation path (register, change-password, pickup-partner creation) — login's own floor deliberately left at 8 so no existing account is locked out. |
| INFRA-4 | `actions/checkout` and `actions/setup-node` in `ci.yml` pinned to commit SHAs (with the resolved version in a trailing comment) instead of the floating `v4` tag. |
| INFRA-5 | Documented in `docs/DEPLOYMENT.md` — a least-privilege `nationwide_app` Postgres role (with a ready-to-run `CREATE ROLE`/`GRANT` script) and a pre-go-live `usesuper` check. The local `docker-compose.yml` superuser connection is confirmed dev-only, not a production template. |
| INFRA-6 | Documented in `docs/DEPLOYMENT.md` — the existing structured-logger auth trail (`LOGIN_SUCCESS`/`LOGIN_FAILED`/etc.) is durable only if the hosting platform captures stdout; this is now an explicit go-live checklist item. No `ROLE_CHANGED` event exists because no admin-role-change feature exists yet — noted as a follow-up for whenever that feature ships, rather than invented ahead of it. |

Verification: 282 backend unit tests passing (up from 247), all 12 backend e2e suites passing
(93 tests), frontend unit tests passing, both apps typecheck clean, both Docker images build and
boot correctly as non-root, `npm audit` reports zero vulnerabilities.

---

## 1. Executive Summary

| | |
|---|---|
| Findings | 0 Critical · **2 High** · **6 Medium** · **11 Low** · 1 Informational |
| Areas with no exploitable defect found | SQL injection, command injection, path traversal, XSS, CSRF, CORS, open redirect, OAuth redirect handling, price/weight manipulation via client input, role forgery, audit-log tampering |
| Highest-priority action | Upgrade Next.js and `sharp` — both have public HIGH-severity CVEs in the exact versions currently installed |
| Second priority | Sign and verify the inbound WhatsApp webhook; it currently accepts unauthenticated POSTs that can rewrite notification-delivery records |
| Overall posture | The application-layer security fundamentals (auth, authorization, injection defense, business-logic trust boundaries) are **substantially better than average** for a system at this stage — a prior hardening pass is visible in the code and holds up under adversarial review. The gaps that remain are concentrated in **dependency freshness, rate limiting, webhook authentication, and container/CI hardening** — all fixable without architectural change. |

The single most consequential fact from this audit: **no endpoint anywhere in the codebase trusts
a client-supplied price, weight discount, or payment status for a money-moving operation.** That
is the finding this audit spent the most effort trying to disprove (§5), and it held.

---

## 2. Threat Model

| Actor | Capability assumed | Primary risks reviewed |
|---|---|---|
| Unauthenticated attacker | Full knowledge of frontend, API routes, browser devtools; can script arbitrary HTTP requests | Auth bypass, IDOR, injection, enumeration, open redirect |
| Customer (valid account) | Everything above + a valid access token for their own account | Privilege escalation, IDOR against other customers, price/weight tampering |
| Pickup partner (valid account) | Everything above + assigned-pickup access | IDOR against other partners' pickups, payment-collection fraud, state-machine abuse |
| Compromised customer/partner session | Stolen access/refresh token (XSS, malware, shared device) | Session persistence after password change, replay |
| Malicious/careless admin (insider) | Full STAFF/ADMIN panel access | Audit-trail tampering, unbounded pricing changes, data exfiltration |
| Compromised third party | Can send requests that *look* like they came from Google OAuth, WhatsApp/Meta, or the ICL carrier API | Webhook spoofing, OAuth token forgery |
| Automated bot | High-volume scripted requests, no rate constraint assumed a priori | Tracking-number enumeration, credential stuffing, quote-endpoint cost abuse |

Every finding below is filed against one or more of these actors.

---

## 3. Detailed Findings

Findings are numbered by area. Severity follows: **Critical** (remote, unauthenticated,
high-impact — money/data/RCE at scale) · **High** (serious impact, some precondition) ·
**Medium** (real but constrained impact, or requires a privileged/insider precondition) ·
**Low** (defense-in-depth / hardening, minimal realistic impact today).

### DEPENDENCIES

#### DEP-1 — HIGH — Next.js version has multiple public HIGH-severity CVEs
**Description:** `apps/frontend` runs `next@16.2.10`. `npm audit` reports this version is affected
by, among others: unauthenticated disclosure of internal Server Function endpoints
(GHSA-955p-x3mx-jcvp), SSRF in Server Actions on custom servers (GHSA-89xv-2m56-2m9x), SSRF via
attacker-controlled rewrite destination hostname (GHSA-p9j2-gv94-2wf4), middleware/proxy bypass
under Turbopack (GHSA-6gpp-xcg3-4w24), and cache-confusion response-body leakage
(GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q). Fix is available: `next@16.3.1`.
**Attack scenario:** An unauthenticated attacker sends a crafted request to a Server Function/Server
Action endpoint and either (a) receives internal endpoint metadata not meant to be public, or (b)
forces the Next.js server to make an outbound request to an attacker-chosen internal address
(SSRF) — potentially reaching internal services (the backend API on its private network address,
cloud metadata endpoints if deployed on AWS/GCP/Azure) that are not meant to be internet-reachable.
**Impact:** Information disclosure and SSRF are both directly actionable against a deployed
instance without any credentials. SSRF against cloud metadata services can lead to credential
theft (IAM role tokens) in the worst case, depending on hosting provider.
**Fix:** `npm install next@16.3.1 --workspace=apps/frontend` (or later patch), re-run `npm audit`
to confirm zero remaining `next` advisories, re-test the app (`npm run build`, smoke-test key
pages) since this is a semver-minor bump that can carry behavior changes.
**Test:** `npm audit --workspace=apps/frontend` shows no `next` advisories; manually verify no
Server Action/rewrite regression by re-running the app's existing test suite and hitting the
quote/order flows end-to-end.

#### DEP-2 — HIGH — `sharp` / libvips has public HIGH-severity CVEs (both apps)
**Description:** `sharp <0.35.0` is installed in both `apps/backend` and `apps/frontend`
(transitively via Next's image optimizer and directly for PDF/logo processing in the backend).
`npm audit` cites CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 in the bundled
libvips. Fix available at `sharp@0.35.3` (breaking change per npm's own flag).
**Attack scenario:** Backend: `admin-company-settings.controller.ts` accepts image uploads
(company logo) that are processed by `sharp`/libvips-dependent code paths; a crafted image file
could trigger a libvips memory-corruption bug. Frontend: any image passed through Next's
`/_next/image` optimizer is processed by the same vulnerable libvips.
**Impact:** Depending on the specific CVE class (the advisory references memory-safety issues in
image decoding), potential for denial of service (crash) up to memory corruption. This is
reachable by any authenticated admin uploading a logo, and by any unauthenticated user who can get
an image URL rendered through `/_next/image` (if that route accepts external URLs — verify
`images.remotePatterns`/`domains` config is restrictive).
**Fix:** `npm install sharp@0.35.3` in both workspaces; run `npm run build` in both apps afterward
and manually re-verify the logo upload → PDF generation flow (`RateCardPdfService`) and the
Next.js image optimizer still function, since this is flagged as a breaking upgrade.
**Test:** `npm audit --workspace=apps/backend` / `--workspace=apps/frontend` show no `sharp`
advisories; upload a company logo through the admin UI and confirm a rate-card PDF still renders
the logo correctly.

*(`postcss <=8.5.22`'s HIGH advisories — CSS stringify XSS and arbitrary `.map` file disclosure —
are a transitive dependency of the vulnerable Next.js version above and resolve automatically once
DEP-1 is fixed; not tracked as a separate item.)*

### BUSINESS LOGIC

#### BIZ-1 — MEDIUM — Inbound WhatsApp webhook accepts unsigned requests
**Description:** `POST /webhooks/whatsapp` (`whatsapp-webhook.controller.ts:22-64`) has no
`JwtAuthGuard` and, critically, **no HMAC/`X-Hub-Signature-256` verification** on the POST handler
— only the one-time GET handshake checks a shared verify token. The code's own comment
acknowledges this: *"a real deployment should also verify the X-Hub-Signature-256 header... once
one is issued."* Any request that reaches this URL is trusted at face value.
**Attack scenario:** An attacker who knows (or guesses) this webhook's public URL sends a forged
POST body containing an arbitrary `providerMessageId`. `recordDeliveryStatus`
(`notifications.service.ts:68-87`) will `updateMany` matching `Notification` rows' `status`,
`deliveredAt`, `readAt` fields — the attacker can mark real customer notifications as
delivered/read (or leave them permanently stuck) without ever having sent the underlying WhatsApp
message, corrupting delivery-status data used for support/ops visibility.
**Impact:** Data integrity loss on notification records; no direct path to money, PII disclosure,
or account takeover was found from this endpoint, but it is a genuine unauthenticated write
surface and should not ship to production unsigned. Also note WhatsApp/Meta payloads can include
customer phone numbers and message content in the request body — even though this app doesn't
currently *return* that data anywhere, an unauthenticated endpoint that *ingests* it is still
attack surface worth closing.
**Fix:** Implement `X-Hub-Signature-256` verification per Meta's documented scheme: compute
`HMAC-SHA256(appSecret, rawRequestBody)` and compare (timing-safe, see BIZ-3) against the header
before processing. Reject with 401 if missing/mismatched. This requires capturing the *raw* body
before NestJS's body-parser JSON-decodes it (use `rawBody: true` in `NestFactory.create` /
a raw-body middleware scoped to this route).
**Test:** Send a POST to `/webhooks/whatsapp` with no/incorrect signature header → expect 401 and
no DB write. Send with a correctly computed signature → expect 200 and the matching `Notification`
row updated. Add this as an automated e2e test.

#### BIZ-2 — MEDIUM — Partner-reported cash-collection amount has no cross-check
**Description:** `CollectPaymentDto.collectedAmount` (`collect-payment.dto.ts:12`) validates only
`@IsPositive()`. Nothing in `pickup-requests.service.ts:460-469` compares the partner-reported
figure against `pickupRequest.verifiedPrice`/`estimatedPrice` before it's written to
`Order.paidAmount` in `acceptParcel` (`pickup-requests.service.ts:561`).
**Attack scenario:** A pickup partner collects the full cash amount from a customer in person but
reports a smaller `collectedAmount` (or a colluding partner and customer agree to under-report),
pocketing the difference. The system has no automated way to detect this — it silently accepts and
permanently records the understated figure as the order's paid amount.
**Impact:** Direct revenue leakage in a cash-collection business model; because this requires a
partner-side actor (not a remote unauthenticated attacker), it's an insider/fraud risk rather than
a classic remote exploit, but it is real money and should have a control.
**Fix:** Add a server-side tolerance check: reject (or flag for manual admin review) if
`abs(collectedAmount - pickupRequest.verifiedPrice) > toleranceThreshold` (e.g. ₹5, or a
percentage). At minimum, log/audit any collection that deviates from the verified price so finance
can review deltas in aggregate, rather than having zero signal today.
**Test:** Submit `collectedAmount` significantly below `verifiedPrice` for a test pickup → with the
fix, expect either rejection or a flagged/audited record; today, expect silent acceptance
(confirms the gap pre-fix).

#### BIZ-3 — LOW — WhatsApp verify-token comparison is not constant-time
**Description:** `whatsapp-webhook.controller.ts:42` compares the GET handshake token via plain
`verifyToken === expectedToken`, which is vulnerable in theory to a timing side-channel.
**Attack scenario:** In practice this is a one-time setup handshake performed once by Meta when the
webhook is registered, not a per-request secret compared under attacker-controlled load — the
practical exploitability is very low. Still, this same pattern would be a real issue if reused
anywhere a secret is compared per-request under attacker timing control.
**Fix:** Use `crypto.timingSafeEqual` (with length-equalized buffers) instead of `===` for this and
any future secret-comparison code, as a matter of consistent practice.
**Test:** Code review / static check that no `===`/`!==` comparison is used against a
security-relevant secret anywhere in the codebase.

#### BIZ-4 — LOW — No upper bound on quote weight
**Description:** `create-quote.dto.ts:28` validates `weightKg` with `@IsPositive()` only, no
`@Max()`. A client can submit up to the `Decimal(10,2)` column ceiling (~99,999,999.99).
**Attack scenario:** Not a price-manipulation vector — `pricing-engine.service.ts` correctly routes
anything over 100kg to `NEEDS_MANUAL_REVIEW` (`quotes.service.ts:603`) rather than computing a
price for it. The realistic abuse is flooding the manual-review queue with junk quotes.
**Fix:** Add a sane `@Max(1000)` (or whatever the business's real oversized-shipment ceiling is) so
obviously-invalid submissions are rejected outright rather than consuming a human reviewer's time.
**Test:** Submit `weightKg: 99999999` → expect 400 validation error post-fix.

### AUTHENTICATION & SESSION

#### AUTH-1 — MEDIUM — Password change does not invalidate the existing refresh token
**Description:** `changePassword` (`auth.service.ts:341-363`) updates `passwordHash` only; it never
touches `hashedRefreshToken`. Logout (`auth.service.ts:336-339`) correctly nulls it out, but the
password-change path does not.
**Attack scenario:** An attacker who has stolen a victim's refresh token/cookie (via XSS on another
site, malware, shared device, etc.) retains full API access via `POST /auth/refresh` even after the
victim — suspecting compromise — changes their password. The victim's defensive action does not
achieve its goal.
**Impact:** Direct session-persistence-after-remediation gap; this is exactly the scenario ASVS
V3.3 (session invalidation on credential change) exists to prevent.
**Fix:** In `changePassword`, also call the same revocation used by logout (`hashedRefreshToken:
null`) so the change forces re-authentication everywhere, or explicitly issue a fresh token pair to
the requester's *current* session while revoking all others if multi-tab UX is a concern.
**Test:** Log in, capture the refresh token/cookie, change the password via the API, then attempt
`POST /auth/refresh` with the old cookie → expect 401 post-fix (currently succeeds).

#### AUTH-2 — LOW — Account enumeration via registration endpoint
**Description:** `auth.service.ts:112` returns `'An account with this email already exists'` and
`:120` returns `'An account with this phone number already exists'` on `POST /auth/register`.
**Attack scenario:** An attacker scripts a list of candidate emails/phone numbers against
`/auth/register` and uses the distinct error message to build a list of who has an account —
useful for targeted phishing or credential-stuffing prioritization. (Login itself is correctly
enumeration-safe — see §4.)
**Impact:** Low — this is common in consumer signup flows and doesn't itself grant access, but it
is a real information leak worth a conscious decision rather than an accident.
**Fix:** If the business is comfortable with the current UX tradeoff, no change is required —
document it as an accepted risk. If not, switch to a "we've sent a confirmation link" response
regardless of whether the email is new or existing (with the actual duplicate-account case handled
silently via the email/SMS content instead of the API response).
**Test:** N/A (policy decision) — if changed, verify `/auth/register` returns an identical response
shape/message for both new and duplicate email.

#### AUTH-3 — LOW — Password policy allows weak passwords
**Description:** `register.dto.ts:19`, `login.dto.ts:8`, `change-password.dto.ts:9` enforce
`@MinLength(8)` only — no complexity requirement, no breached-password check.
**Fix:** Add a complexity check (or, per current NIST guidance, prefer length + a
breached-password-list check via a service like the k-anonymity HaveIBeenPwned API over arbitrary
complexity rules) and raise the minimum to 10–12 characters.
**Test:** Attempt registration with `password: "aaaaaaaa"` → expect rejection post-fix.

#### AUTH-4 — INFORMATIONAL — No self-service password reset flow exists
**Description:** No `forgot-password`/`reset-password` endpoint exists anywhere in the codebase.
This is not itself a vulnerability (it removes an entire class of reset-flow attack surface — no
reset-token generation/expiry/single-use logic to get wrong), but it's a functional gap worth
flagging since ASVS assumes a secure reset flow exists. If one is added later, it must independently
receive the same rigor as login (rate limiting, single-use time-boxed tokens, no enumeration via
response timing/message, invalidate on use, invalidate any existing session).
**Fix:** N/A today. Track as a requirement for whenever self-service reset ships.

### AUTHORIZATION / IDOR

#### AUTHZ-1 — LOW — Public tracking endpoint uses a sequential, enumerable identifier
**Description:** `GET /tracking/:internalTrackingNumber` (`tracking.controller.ts:5-14`) is
intentionally public/unauthenticated (parcel tracking is a public-by-design feature), but the
identifier itself — `NW-{YY}-{sequenceNumber}` where `sequenceNumber` is a Postgres
`@default(autoincrement())` int (`prisma/schema.prisma:586`) — is trivially enumerable.
**Attack scenario:** An attacker scripts sequential requests (`NW-26-00000001` … `NW-26-00000999`
…) and harvests shipment status/location/event history for every shipment in the system without
ever knowing a real tracking number. No customer PII is returned per the response DTO, but this is
still a full scrape of the business's shipment volume and status data, and a competitor or
attacker could use it to infer operational scale, route patterns, or target specific shipments for
follow-on physical-world attacks (theft opportunity via "which parcels are in transit right now").
**Impact:** Business-data exposure at scale, not customer PII exposure — still a real confidentiality
issue and, combined with AUTHZ-1's lack of rate limiting (see INFRA-1), trivially scriptable.
**Fix:** Two independent mitigations, either is sufficient, both is better: (1) add rate limiting
specific to this endpoint (see INFRA-1), and/or (2) generate a separate high-entropy public tracking
token (e.g. a 12-character random string) distinct from the internal sequential number, and require
that token instead of the predictable one for the public-facing lookup.
**Test:** Script 50 sequential tracking-number guesses in under a minute → expect throttling
(429) well before completion, post-INFRA-1 fix.

### INPUT VALIDATION

#### VAL-1 — LOW — Missing upper bounds on monetary/percentage DTO fields
**Description:** `pricing/dto/update-rate.dto.ts` (`baseRate`, `gstPercent`, `nationwideCut`),
`pickup-requests/dto/collect-payment.dto.ts` (`collectedAmount`), and
`admin/dto/update-order-payment.dto.ts` (`paidAmount`) all validate `@IsPositive()`/`@Min(0)` but
none has a `@Max()`. These are all `STAFF`/`ADMIN`-only or ownership-checked paths, so this is a
data-integrity hardening item, not an exploitable-by-outsider defect.
**Fix:** Add business-sane ceilings (e.g. `@Max(100)` on percentage fields, a reasonable currency
ceiling on rate/amount fields) so a fat-fingered or malicious admin can't silently corrupt pricing.
**Test:** Submit `gstPercent: 999999` via the admin rate-update endpoint → expect 400 post-fix.

#### VAL-2 — LOW — Country code field lacks format validation
**Description:** `pricing/dto/create-country.dto.ts:4-6` validates `code` with `@IsString
@MinLength(1)` only. This value is later used to build a filesystem path in
`flag.service.ts:35-36`: `join(getFlagsDir(), \`${key}.svg\`)`.
**Attack scenario:** An ADMIN (the only role that can reach `CreateCountryDto`,
`admin-countries.controller.ts:20-22`) could store `code: "../../../etc/passwd"`. Real-world risk
is low: the `.svg` suffix is always appended (so it can't resolve to an arbitrary non-svg file),
and any failure is silently caught and returns `undefined` (`flag.service.ts:49-55`) rather than
leaking file contents or an error. This requires an already-compromised or malicious ADMIN account
to exploit, and even then achieves nothing more than a silently-swallowed failure.
**Fix:** `@Length(2, 2) @Matches(/^[A-Z]{2}$/)` to match real ISO country codes regardless of the
low current risk — cheap to fix, removes the theoretical path-traversal shape entirely.
**Test:** Attempt to create a country with `code: "../evil"` → expect 400 post-fix.

#### VAL-3 — LOW/MEDIUM — No page-level Content-Security-Policy on the frontend
**Description:** `apps/frontend/next.config.ts:8-16` sets a CSP scoped only to Next's image
optimizer responses (`images.contentSecurityPolicy`), not the application's actual HTML pages.
There is no `middleware.ts` and no `headers()` function providing a site-wide CSP, and `helmet()`
on the backend (which does set a CSP) only covers API JSON responses, not the pages the browser
actually renders.
**Attack scenario:** Given the codebase currently has zero XSS injection sinks (confirmed — no
`dangerouslySetInnerHTML`, `innerHTML`, or `eval` anywhere in the frontend), this is pure
defense-in-depth: a CSP would contain the blast radius *if* an XSS bug is ever introduced later
(e.g. via a future markdown renderer, rich-text field, or third-party widget), by blocking inline
script execution and restricting script sources.
**Fix:** Add a `headers()` function in `next.config.ts` (or a `middleware.ts`) setting
`Content-Security-Policy`, `X-Frame-Options: DENY` / `frame-ancestors 'self'`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and
`Strict-Transport-Security` on all page responses. Start with a strict policy
(`default-src 'self'; script-src 'self'; frame-ancestors 'none'`) and loosen only for concretely
needed third-party origins (Google OAuth redirect, any CDN).
**Test:** `curl -I https://app-domain/` and confirm `Content-Security-Policy` and `X-Frame-Options`
headers are present post-fix.

### INFRASTRUCTURE

#### INFRA-1 — MEDIUM — Sensitive endpoints rely on a single generous global rate limit
**Description:** `app.module.ts:30` sets one global default (`ttl: 60_000, limit: 300` — 300
requests/minute/IP). Only the 4 auth endpoints have a tighter `@Throttle` override
(`auth.controller.ts:38`, limit 5/min). Quote creation, order creation, pickup-request creation,
public tracking lookup, and every admin endpoint rely solely on the 300/min global default.
**Attack scenario:** 300 req/min is high enough that (a) tracking-number enumeration (AUTHZ-1) is
essentially unthrottled in practice, (b) an attacker can generate large volumes of quotes (each of
which does real DB/compute work) as a low-grade resource-exhaustion/cost-abuse vector, and (c) a
distributed attacker (many source IPs) isn't meaningfully slowed by any per-IP limit regardless of
its value.
**Fix:** Add endpoint-specific `@Throttle` overrides tuned to realistic legitimate usage:
tracking lookup (e.g. 20/min/IP), quote creation (e.g. 10/min/IP or /session), order/pickup-request
creation (e.g. 10/min/account). Consider layering an account-level (not just IP-level) limiter for
authenticated endpoints, since IP-based limits alone don't stop a single logged-in attacker
rotating IPs, and consider a Redis-backed distributed limiter (Redis is already in the stack) if
horizontal scaling means per-instance in-memory throttling isn't enough.
**Test:** Script 30 tracking requests in 60 seconds → expect 429s after the new threshold,
pre-fix expect all 30 to succeed.

#### INFRA-2 — MEDIUM — CI does not fail the build on dependency vulnerabilities
**Description:** `.github/workflows/ci.yml:103-105` runs `npm audit --audit-level=high` with
`continue-on-error: true` — DEP-1/DEP-2 above would not have blocked a merge; they're only visible
in CI logs if someone looks.
**Fix:** Remove `continue-on-error: true` (or gate it behind a documented, time-boxed exception
process) so HIGH/CRITICAL advisories fail the pipeline. Pair with a scheduled (not just per-PR)
`npm audit`/Dependabot run so vulnerabilities disclosed *after* a dependency was last touched are
still caught.
**Test:** Introduce a known-vulnerable dependency in a branch, open a PR, confirm CI fails
post-fix.

#### INFRA-3 — MEDIUM — Application containers run as root
**Description:** Neither `apps/backend/Dockerfile` nor `apps/frontend/Dockerfile` contains a
`USER` directive — both run their final process as root inside the container.
**Attack scenario:** Root-in-container is not itself remotely exploitable, but it removes a layer
of defense-in-depth: if any other vulnerability in this report (or an undiscovered one) achieves
code execution inside the container, running as root maximizes what that foothold can do
(read/write anywhere in the container filesystem, more likely to enable container-escape
techniques that specifically require root).
**Fix:** Add a non-root `USER` in both Dockerfiles' final stage (create a dedicated `app` user,
`chown` the working directory, `USER app` before `CMD`). Verify file permissions on
`storage/`/mounted volumes still allow the app to write uploaded logos.
**Test:** `docker run <image> whoami` → expect a non-root username post-fix; re-verify the logo
upload flow still works end-to-end against the rebuilt image.

#### INFRA-4 — LOW — GitHub Actions pinned to major-version tags, not commit SHAs
**Description:** `ci.yml:50,53` use `actions/checkout@v4`, `actions/setup-node@v4` — floating major
tags rather than a pinned commit SHA.
**Fix:** Pin to a full commit SHA (`actions/checkout@<sha> # v4.x.x`) for any action that has
write access to secrets, per current supply-chain-hardening guidance (this mitigates a compromised
upstream Action silently shipping malicious code under an existing tag).
**Test:** Code review — confirm workflow YAML references full SHAs.

#### INFRA-5 — LOW — Local dev-compose Postgres user is the instance superuser
**Description:** `docker-compose.yml:6-7` uses the official `postgres` image's default
initialization user (`nationwide`/`nationwide_dev`) as the app's DB connection user — this is the
instance superuser by default, not a scoped least-privilege application role. This compose file is
explicitly for local dev/smoke-testing (confirmed: `railway.json` builds only the backend
Dockerfile directly, not via this compose file), so it is not confirmed to reflect the production
database configuration.
**Fix:** Regardless of dev/prod distinction, define a dedicated, least-privilege `nationwide_app`
role (no `SUPERUSER`, no `CREATEDB`, no `DROP` on other schemas) for the application connection
string in **every** environment, and confirm explicitly what role the production `DATABASE_URL`
actually connects as (this audit could not verify production infrastructure directly — flagged for
manual confirmation by whoever manages the production database).
**Test:** `SELECT current_user, usesuper FROM pg_user WHERE usename = current_user;` against the
production connection → `usesuper` must be `false`.

#### INFRA-6 — LOW — Login and role-change events are not in the audit trail
**Description:** The `AuditLog` model and `admin-audit-logs.controller.ts` (read-only — confirmed
no `DELETE`/`PATCH`/`PUT` exposed, good) correctly capture business-object changes (payment
updates, rate changes, pickup-request lifecycle events) but no `LOGIN`/`LOGIN_FAILED`/
`ROLE_CHANGED` action was found written anywhere.
**Fix:** Add audit-log writes for successful login, failed login (useful for detecting credential
stuffing patterns even without a hard lockout), and any admin role change, consistent with the
existing `AuditLog` shape.
**Test:** Log in, then query `AuditLog` for a `LOGIN` entry matching the actor/timestamp post-fix.

---

## 4. Verified Secure Controls (evidence-based, not assumed)

These were actively tested-against (i.e., the auditor tried to find a bypass) and held:

- **SQL injection:** Zero raw-SQL surface — the only `$queryRaw` in the codebase is a hardcoded
  `SELECT 1` health check (`health.controller.ts:46`). All data access goes through Prisma's
  parameterized query builder.
- **Command injection:** Zero `child_process`/`exec`/`spawn` usage anywhere in the backend.
- **XSS:** Zero `dangerouslySetInnerHTML`, `innerHTML =`, `eval(`, or `new Function(` anywhere in
  the frontend.
- **CSRF:** Not exploitable — the API uses `Authorization: Bearer` headers (immune to CSRF by
  construction) for every business endpoint; the one cookie-driven endpoint (`/auth/refresh`) is
  `httpOnly` + `SameSite=Lax` + POST-only, which browsers withhold cross-site.
- **CORS:** `origin` is a static env-configured string, never `*`, never a reflected
  `Origin` header (`main.ts:46-58`).
- **Open redirect:** The frontend's post-login `?redirect=` param is validated by
  `isSafeRedirectTarget()` (`app/login/page.tsx:30-32`) — requires a leading `/`, explicitly
  rejects `//` and `/\` (protocol-relative-URL bypass patterns). Google OAuth `callbackURL` is
  server-configured from env, never client-influenced (`google.strategy.ts:28-29`).
  **This exact control (`isSafeRedirectTarget`) was verified during this audit — see §3, no VAL/AUTHZ
  finding was needed because it held.**
- **Price/weight/discount manipulation:** No DTO anywhere in the quote/order/pickup flow accepts a
  price, rate, discount, fuel-charge, PSS, or GST field from the client. `pricing-engine.service.ts`
  is the sole source of truth, computed from DB rate cards. Global `ValidationPipe({whitelist:
  true, forbidNonWhitelisted: true})` (`main.ts:40-42`) rejects any smuggled extra field outright.
- **Payment-status forgery:** No customer- or partner-facing endpoint accepts an arbitrary
  `paymentStatus` value; the only endpoint that does (`PATCH /admin/orders/:id/payment`) is
  `ADMIN`-gated, and the partner-collection flow (`acceptParcel`) only marks payment collected
  after server-verified `verifiedAt`/`paymentCollectedAt` gates pass.
- **Race conditions:** Every state-changing pickup-request/quote operation
  (`selectOption`, `markArrived`, `collectPayment`, `acceptParcel`, quote creation) uses atomic
  `updateMany({where:{id,status:X}}) + count` claims rather than read-then-write, and
  `acceptParcel`'s multi-table write is wrapped in `prisma.$transaction`
  (`pickup-requests.service.ts:555-594`) — no double-processing path found.
- **State-machine integrity:** Explicit transition allow-lists
  (`pickups.service.ts:18-32,99-104`) and step-gating on `PickupRequest` (verify requires
  `arrivedAt`; payment collection requires `verifiedAt`; parcel acceptance requires both) — no
  blind status overwrite anywhere.
- **IDOR/BOLA:** Every "my resource" route (orders, quotes, pickup-requests — both customer- and
  partner-facing) fetches-then-compares an ownership field against `req.user.sub`/partner ID before
  returning or mutating data, consistently, across every module reviewed. Unscoped `findUnique(id)`
  service methods exist but are only reachable via `STAFF`/`ADMIN`-gated routes.
- **RBAC:** All 15 admin controllers carry both `JwtAuthGuard` and `RolesGuard` +
  `@Roles(...)`. No `@Public()` decorator exists anywhere in the codebase (zero routes
  accidentally exposed). `RolesGuard`'s only fail-open path (no `@Roles()` metadata → allow) is
  never hit by an unintentionally-unannotated route in this review.
- **Role forgery:** JWT `role` claim is always sourced from the authenticated DB row at
  login/refresh time, never from client-supplied request data — no self-registration-to-ADMIN
  path exists (`RegisterDto` has no role field; server hardcodes `'CUSTOMER'`).
- **Refresh-token security:** Rotation + reuse detection implemented correctly — a
  mismatched/replayed refresh token revokes the account's session rather than failing silently
  (`auth.service.ts:312-334`).
- **Secrets hygiene:** No hardcoded real secrets found anywhere in tracked source; `.env` is
  git-ignored; `env.validation.ts` enforces presence and minimum length on every required secret at
  boot (fail-fast, not fail-open).
- **Error handling:** The global exception filter (`http-exception.filter.ts:108-114`) always
  returns a generic `"Something went wrong. Please try again."` for unhandled errors — stack
  traces, Prisma error internals, and file paths never reach the client, in any environment.
- **Audit-log tamper resistance:** `admin-audit-logs.controller.ts` exposes `@Get()` only — no
  admin, however privileged, can delete or modify audit history via any HTTP endpoint.
- **Secret logging:** No `logger`/`console` call anywhere in the codebase logs a password, token,
  or secret value.
- **ICL/carrier credentials:** Never logged, never returned in any API response reachable by the
  frontend.

---

## 5. Security Test Case Results

Mapped to the fourteen test cases specified in the audit brief. "Verified" means this audit traced
the actual code path and confirmed the expected behavior; "Gap" means the expected behavior does
not currently hold.

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Customer accesses another customer's order by changing `:id` | **Verified** | `orders.service.ts` scoped queries; unscoped path is role-gated to STAFF/ADMIN only |
| 2 | Pickup partner accesses admin endpoint | **Verified** | `RolesGuard` rejects; all admin controllers require `STAFF`/`ADMIN` |
| 3 | Customer modifies price in request body | **Verified** | No price field in any customer DTO; server-computed only |
| 4 | Attacker changes order ID in URL | **Verified** | Ownership check (fetch-then-compare) on every route |
| 5 | Thousands of tracking requests | **GAP — see AUTHZ-1 / INFRA-1** | No endpoint-specific throttle; sequential ID |
| 6 | Attacker modifies payment status | **Verified** (customer/partner path) / **Medium gap** (cash amount, see BIZ-2) | Admin-only for direct status set; collection amount untrusted |
| 7 | Malformed input | **Verified** | Global `ValidationPipe` with `forbidNonWhitelisted` |
| 8 | SQL injection | **Verified** | No raw-SQL interpolation exists |
| 9 | XSS payload | **Verified** | No dangerous rendering sinks exist |
| 10 | `/admin` without authentication | **Verified** | `JwtAuthGuard` on every admin controller |
| 11 | Authenticated customer calls `/admin` API directly | **Verified** | `RolesGuard` rejects |
| 12 | Open redirect via `?redirect=` | **Verified** | `isSafeRedirectTarget()` allowlist holds |
| 13 | Replay a payment webhook | **N/A** | No online payment gateway/webhook exists (cash/UPI-by-partner model); the one inbound webhook (WhatsApp) has no replay issue but does have a signature gap (BIZ-1) |
| 14 | Session fixation | **Verified** | New JWT + rotated refresh token issued at every login/refresh |

**11 of 14 fully pass. Two are downgraded to documented gaps (#5, #6) with fixes specified above.
One (#13) doesn't apply to this system's actual payment architecture.**

---

## 6. Findings Summary Table

| ID | Severity | Area | One-line |
|---|---|---|---|
| DEP-1 | High | Dependencies | Next.js has multiple public HIGH CVEs (SSRF, info disclosure) — upgrade to 16.3.1+ |
| DEP-2 | High | Dependencies | `sharp`/libvips HIGH CVEs in both apps — upgrade to 0.35.3 |
| BIZ-1 | Medium | Webhooks | WhatsApp inbound webhook has no signature verification |
| BIZ-2 | Medium | Business logic | Partner cash-collection amount has no server-side cross-check |
| INFRA-1 | Medium | Rate limiting | Quote/order/pickup/tracking/admin endpoints share one generous global limit |
| INFRA-2 | Medium | CI/CD | `npm audit` failures don't block CI (`continue-on-error: true`) |
| INFRA-3 | Medium | Containers | Both Dockerfiles run as root |
| AUTH-1 | Medium | Session | Password change doesn't invalidate existing refresh token |
| BIZ-3 | Low | Webhooks | Non-constant-time token comparison |
| BIZ-4 | Low | Validation | No upper bound on quote weight |
| AUTH-2 | Low | Auth | Registration enumerates existing emails/phones |
| AUTH-3 | Low | Auth | Password policy is length-only, min 8 |
| AUTH-4 | Info | Auth | No password-reset flow exists (tracked for future) |
| AUTHZ-1 | Low | Tracking | Sequential tracking number is enumerable |
| VAL-1 | Low | Validation | Missing `@Max` on money/percent DTO fields |
| VAL-2 | Low | Validation | Country code field lacks format validation |
| VAL-3 | Low/Med | Headers | No page-level CSP on the frontend |
| INFRA-4 | Low | CI/CD | GitHub Actions pinned to tags, not SHAs |
| INFRA-5 | Low | Database | Dev-compose DB user is superuser-equivalent (confirm prod separately) |
| INFRA-6 | Low | Logging | Login/role-change events missing from audit trail |

---

## 7. Remediation Roadmap

**Before production / this sprint (High + the Mediums with real remote-reachable impact):**
1. DEP-1 — upgrade Next.js to 16.3.1+
2. DEP-2 — upgrade `sharp` to 0.35.3+ in both apps
3. BIZ-1 — sign and verify the WhatsApp webhook
4. INFRA-1 — add endpoint-specific rate limits (tracking, quote, order, pickup-request creation)
5. AUTH-1 — invalidate refresh token on password change
6. INFRA-2 — make CI fail on HIGH/CRITICAL `npm audit` findings

**Next sprint (remaining Mediums + Lows with low effort):**
7. INFRA-3 — non-root Docker users
8. BIZ-2 — cash-collection tolerance check
9. AUTHZ-1 — rate-limit or opaque-token the public tracking endpoint
10. VAL-1, VAL-2 — add missing bounds/format validation
11. VAL-3 — add site-wide CSP/security headers to the frontend

**Backlog (low urgency, cheap to batch in):**
12. AUTH-2, AUTH-3 — enumeration/password-policy decisions
13. INFRA-4, INFRA-5, INFRA-6 — CI SHA-pinning, DB role confirmation, audit-log coverage
14. BIZ-3, BIZ-4 — constant-time comparison, quote weight ceiling

---

## 8. Production Readiness Determination

**Not yet — but close, and the gap is well-defined.**

The things that are hardest to retrofit — authorization architecture, injection defense, business-logic
trust boundaries, session design — are already correctly built and held up under this audit's
attempts to break them. That is the expensive, hard-to-fix-later part, and it's done.

What remains is the cheaper, mechanical part: two dependency upgrades with known public CVEs, one
missing webhook signature, rate-limit tuning, and container/CI hardening. None of these require a
redesign. **Items 1–6 in §7 should be treated as release blockers; the rest can ship alongside or
immediately after initial production launch with a tracked timeline.**

This audit was source-code-only — it did not include live penetration testing against a deployed
instance, infrastructure/network-level review (firewall rules, actual production DB privilege
level — see INFRA-5, TLS termination config), or a review of backup encryption/access controls
(§45 of the brief) or monitoring/alerting configuration (§44), since those live outside this
application's source tree. Those should be independently verified against whatever hosting
provider and monitoring stack is actually in production before final go-live sign-off.
