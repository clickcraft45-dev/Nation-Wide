# Admin / Staff User Guide

Sign in at `/login` with your staff or admin account. `STAFF` and `ADMIN` share most of the admin
UI; a few sections (Pricing configuration, Company/rate-card settings) are `ADMIN`-only and won't
appear in the nav for `STAFF` accounts.

## Dashboard

Landing page after login. KPI cards (total orders, in-transit, delivered, customers, scheduled
pickups, pending payments, quote requests) each link through to the relevant filtered list.
"Recent activity" is the tail of the audit log.

## Customer journey you're operating

The platform's core flow, end to end:

1. **Quote** — a customer requests a quote (self-service) or you create one on their behalf via
   **Quote Requests → New Quote**. Most quotes price automatically from the pricing engine; ones
   flagged `NEEDS_MANUAL_REVIEW` (dangerous goods, oversized, restricted destination, no rate
   available) need a manual price from you before the customer can accept.
2. **Pickup Request** — once a customer accepts a quote, they submit a pickup request (address,
   time slot). It starts `PENDING_ASSIGNMENT`.
3. **Assign a partner** — in **Pickup Requests**, assign one of your `PICKUP_PARTNER` accounts.
   Status moves to `ASSIGNED` → the partner schedules it → `SCHEDULED` → `OUT_FOR_PICKUP`.
4. **Verification & payment** — the pickup partner physically weighs the parcel (this can trigger
   a price recalculation if the declared and actual weight differ), collects payment, and accepts
   the parcel. This is entirely the partner's workflow — you don't act here, but you can watch
   status progress in **Pickup Requests**.
5. **Order generation** — accepting the parcel is what actually creates the real `Order` +
   `Shipment` + tracking number. Nothing upstream of this step is a real, trackable shipment yet.
6. **Tracking** — from here it's the normal tracking lifecycle (**Tracking** page, or the
   customer-facing `/track` page with the tracking number).

## Orders

**Orders** list supports search (order id, tracking number, customer name/phone), status/provider
filters, column sorting, and pagination once you have more than ~25 orders. **Create Order**
bypasses the quote/pickup flow entirely (used for phone-in orders where pricing was already
agreed) — prefer the quote flow for anything that should go through pricing.

Payment status is edited separately from order status (**Orders → \[order\] → Update Payment**) —
they're intentionally decoupled so one action can't accidentally overwrite the other.

## Pricing (ADMIN only)

Nothing in the quote engine is hardcoded — **Pricing** has five tabs: Countries, Zones (which
countries belong to which pricing zone, per provider), Providers (fuel charge %/PSS per kg, applied
automatically to every rate under that provider), Rates (base rate + GST% + margin per weight
slab), and Rate Cards (generate branded, downloadable PDF rate cards per provider/country
selection). Changes here take effect immediately for new quotes — no deployment needed.

## Pickup Partners

**Pickup Partners** is where you onboard field executives — creates a `PICKUP_PARTNER`-role
account (separate login, cannot access pricing/admin functions). Credentials are shown once at
creation; there's no "resend" — reset by editing the account if a partner loses theirs.

## Audit log & integration health

Every mutating admin action (order payment changes, rate changes, pickup verification, rate card
generation, etc.) is recorded in **Settings → System information → View audit log** with a
before/after snapshot. **Settings → Provider settings → View integration health** shows the live
carrier adapter's recent error rate and average latency — useful for spotting a carrier API outage
before customers start reporting missing tracking updates.

## Common tasks

- **A quote needs manual pricing**: Quote Requests → find the `NEEDS_MANUAL_REVIEW` row → Review →
  enter amount/currency → the customer is notified automatically.
- **A carrier tracking number needs correcting**: Tracking → find the shipment → map/re-map the
  external tracking number. This is append-only and audit-logged.
- **A customer's payment didn't record correctly**: Orders → the order → Update Payment. This
  writes an audit log entry with the actor and before/after values.
