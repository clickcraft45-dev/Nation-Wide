# Online payments (YouPI PG)

Customers can pay what an order owes by UPI from **My Orders**. The checkout is
[YouPI PG](https://github.com/youpi-pg/YouPI-PG), a gateway you host yourself: it shows a UPI QR
for your own bank account and watches that account's SMS and email credit alerts to work out who
paid.

## Read this before turning it on

YouPI is not a licensed payment aggregator and has no connection to the bank. Its own README calls
it an experimental research project, "not certified, bank-approved, NPCI-approved, audited, or
production-ready", and says not to use it as the only proof of payment. In practice that means:

- **It guesses from alerts.** A payment is "observed" when an SMS or email with the right amount
  arrives. Alerts can be late, misread, or matched to the wrong customer when two people owe the
  same amount.
- **One payer at a time.** Each UPI account serves a single checkout at once; other customers queue.
- **About 20 payments a day per account** is the project's own suggested ceiling.
- **A phone has to stay online.** An Android phone (or a Google Messages / Gmail session) reads the
  alerts. If it drops offline the gateway refuses new checkouts and customers see "Online payment
  is paused right now".
- **Customers sign in on the gateway with a WhatsApp OTP** sent through an unofficial WhatsApp
  client, which WhatsApp can block.

Because of this, **the integration never marks an order paid by itself**. The gateway's report puts
the payment in a queue on the admin **Payments** page, and an admin who has found the UTR in the
bank statement presses **Confirm**. That one press runs the usual "Mark Paid" path: audit log,
invoice, receipt on WhatsApp.

If volume grows past a handful of payments a day, move to a licensed gateway (Razorpay, Cashfree,
PhonePe). The `OnlinePayment` table and the confirm/reject screens are not tied to YouPI; only
`youpi.client.ts` and `youpi-webhook.controller.ts` are.

## How a payment flows

1. An order has a due amount (a pay-later or part-paid pickup). The customer sees **Pay ₹…** on
   My Orders.
2. `POST /api/v1/online-payments/me/orders/:orderId/checkout` creates an `OnlinePayment` row for
   the order's due, opens a session on YouPI, and returns its checkout URL. The amount comes from
   the database, never from the browser.
3. The customer pays on the YouPI page and is sent back to `/orders?payment=<orderId>`.
4. YouPI calls `POST /api/v1/webhooks/youpi`. The request is checked against
   `X-Gateway-Signature` (HMAC-SHA256 of the raw body) and de-duplicated on its delivery id.
5. The row moves to `OBSERVED`, `RECONCILED` or `MANUAL_REVIEW` and appears under **Online
   payments to confirm**. The customer sees "Payment being confirmed" and cannot pay again.
6. An admin confirms (order becomes PAID) or rejects with a reason (order stays unpaid, customer
   can retry).

| Gateway event | Row becomes | Meaning |
|---|---|---|
| `OBSERVED_SUCCESS` | `OBSERVED` | A bank alert matched this checkout |
| `RECONCILED` | `RECONCILED` | An operator imported a bank statement into YouPI and a line matched |
| `MANUAL_REVIEW` | `MANUAL_REVIEW` | YouPI could not attribute an alert with certainty |
| any of the above, wrong amount | `MANUAL_REVIEW` | Held with a note saying what was reported |
| `FAILED`, `EXPIRED`, `CANCELLED` | same | Checkout ended; the customer can try again |

## Setup

### 1. Run YouPI

Follow `docs/INSTALLATION.md` in the YouPI repository. It needs Node 22.13+, its own server (it
keeps a SQLite file and long-running observer processes, so it cannot run on Cloudflare Workers),
and a public HTTPS address such as `https://pay.nationwidelogistics.co`. Then, in its Merchant
Admin:

- add the UPI receiving account and pair the Android observer phone;
- create the merchant and copy its **merchant ID**, **API key** (`mk_live_...`) and **webhook
  secret** (three different values);
- set the merchant's **webhook URL** to `https://<api host>/api/v1/webhooks/youpi`.

In YouPI's own `.env`:

```
YOUPI_ALLOWED_RETURN_ORIGINS=https://nationwidelogistics.co
```

This must be exactly the origin of `PUBLIC_FRONTEND_URL`. Without it YouPI rejects every checkout
with "returnUrl origin is not allowlisted".

### 2. Configure this backend

In `backend/.env`:

```
YOUPI_API_URL="https://pay.nationwidelogistics.co"
YOUPI_MERCHANT_ID="..."
YOUPI_MERCHANT_API_KEY="mk_live_..."
YOUPI_WEBHOOK_SECRET="..."
```

All four or none: with any missing, the Pay button is hidden and the webhook rejects everything.

### 3. Apply the migration

```
cd backend && npx prisma migrate deploy
```

### 4. Try it with a small real payment

Give a test customer's order a due amount of a few rupees, pay it from My Orders, and check that it
shows up under **Online payments to confirm** with the right UTR. YouPI has no sandbox bank; its
simulator endpoints are disabled in production.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No Pay button | One of the four `YOUPI_*` variables is unset, or the order has no due amount |
| "Online payment is paused right now" | YouPI's observer phone has not sent a heartbeat in 5 minutes |
| "We could not open the payment page" | Wrong API key or merchant ID, the return origin is not allowlisted, or YouPI is unreachable. The reason is on the `online_payments.note` column and in the backend log |
| Customer paid, nothing in the admin queue | The webhook is not reaching the backend: check the merchant's webhook URL and delivery log in YouPI, and that `YOUPI_WEBHOOK_SECRET` matches |
| "The amount this order owes has changed" on Confirm | The due was edited after the customer paid. Record it with Mark Paid, then reject the queue entry with a note |
