# WhatsApp templates (Gupshup)

Templates are how a message reaches a customer **outside the 24-hour window** — the 24 hours after
their own last message to your number. Without one, free-form sending works only for customers who
are mid-conversation, so most invoice recipients never receive anything.

You do not need all of these. Start with `invoice_ready`; add others as they matter.

## 1. Create it in Gupshup

**Dashboard → WhatsApp → your app (NationWide) → Templates → Create Template**

| Field | What to put |
|---|---|
| Template Name | Exactly the name in the table below (lowercase, numbers and underscores only — Meta rejects anything else) |
| Category | **UTILITY** for every template here |
| Language | English |
| Header | None, except `invoice_ready` which needs **Media → Document** |
| Body | Copy from the table below, `{{1}}` placeholders included |
| Sample values | Mandatory. Use the samples in the table |

**Category matters.** These are all transactional order/shipping updates, which is UTILITY.
Submitting them as MARKETING invites rejection, costs more per message, and lets customers who have
opted out of marketing stop receiving delivery updates.

Approval is Meta's, not Gupshup's — usually minutes to a few hours, occasionally longer. A rejected
template usually means the category was wrong or the sample values didn't match the body.

## 2. Wire it up

After approval, copy the template's ID from the Templates list and add an entry to
`GUPSHUP_TEMPLATES` in the backend's environment:

```
GUPSHUP_TEMPLATES='{"invoice_ready":{"id":"<id-from-gupshup>","params":["customerName","invoiceNumber","amount"]}}'
```

That is the whole change — no code, no redeploy of anything but the env var. The adapter uses a
template whenever one is configured for that notification and falls back to free-form otherwise, so
you can migrate one at a time.

> **The `params` order is not optional.** Gupshup takes a positional array (`{{1}}, {{2}}, {{3}}`)
> while the app passes named variables. The `params` array is what maps one to the other. Get it
> wrong and the message still sends — with the amount printed where the customer's name belongs.
> The order in the table below matches the `{{n}}` order in the body text; keep them together.

## 3. The templates

Names match `NOTIFICATION_TEMPLATES` in `backend/src/modules/notifications/templates.ts`, and
the wording matches `message-bodies.ts` so customers get the same message either way. This table is
generated from that file — if you edit wording, edit it there and regenerate, don't hand-edit here.

**These read long on purpose.** Meta rejects templates with *"too many variables for its length"*:
it wants a decent amount of fixed text around each `{{n}}`. The first, terser draft of
`invoice_ready` was rejected for exactly that. Shortening a body re-opens that rejection, so resist
trimming them.

| Template name | Body | `params` | Sample values |
|---|---|---|---|
| `invoice_ready` | Hi {{1}}, your GST tax invoice from NationWide Logistics is ready. Invoice number: {{2}}. Total amount payable: ₹{{3}}. The invoice PDF is attached to this message, and you can keep it for your accounting records. If you have any questions about this invoice, please reply to this message and our team will assist you. | `["customerName", "invoiceNumber", "amount"]` | Ravi Kumar / NW/2026-27/00042 / 808.00 |
| `order_confirmation` | Your order with NationWide Logistics has been confirmed and is now being processed. Your tracking number is {{1}}. We will send you an update here each time your shipment moves to its next stage. | `["trackingNumber"]` | NW-26-000123 |
| `tracking_number_assigned` | Your shipment with NationWide Logistics has been assigned a tracking number: {{1}}. You can use this number to follow your parcel's progress at any time. | `["trackingNumber"]` | NW-26-000123 |
| `pickup_confirmation` | Good news — your parcel has been picked up. Shipment {{1}} is now with us and on its way to its destination. We will keep you updated as it travels. | `["trackingNumber"]` | NW-26-000123 |
| `in_transit_update` | Your shipment {{1}} is currently in transit and moving towards its destination. We will let you know as soon as it is out for delivery. | `["trackingNumber"]` | NW-26-000123 |
| `out_for_delivery` | Your shipment {{1}} is out for delivery today. Please make sure someone is available at the delivery address to receive the parcel. | `["trackingNumber"]` | NW-26-000123 |
| `delivered` | Your shipment {{1}} has been delivered successfully and has reached its destination. Thank you for choosing NationWide Logistics for your shipping needs. | `["trackingNumber"]` | NW-26-000123 |
| `delivery_exception` | There is a delay with your shipment {{1}}. Our operations team is looking into it and we will send you an update as soon as the situation is resolved. | `["trackingNumber"]` | NW-26-000123 |
| `quote_ready` | Your shipping quote from NationWide Logistics is ready. The total amount for your shipment is ₹{{1}}. Please open the NationWide Logistics app to review the details and confirm your booking. | `["amount"]` | 808.00 |
| `quote_rejected` | We are sorry — we are unable to provide a quote for your shipment at this time. Reason: {{1}}. Please reply to this message and our team will help you find an alternative. | `["reason"]` | Destination not serviceable |
| `pickup_or_dropoff_confirmed` | Your pickup with NationWide Logistics has been confirmed. Current status: {{1}}. Our team will contact you if anything further is needed before collection. | `["status"]` | CONFIRMED |
| `pickup_request_needed` | Your quote has been accepted. To continue, please schedule a pickup for your parcel or choose to drop it at our warehouse. You can do this from the NationWide Logistics app. | `[]` | — |
| `pickup_request_received` | We have received your pickup request with NationWide Logistics. A pickup partner will be assigned shortly, and you will get a message here as soon as that happens. | `[]` | — |
| `pickup_partner_assigned` | A pickup partner has been assigned to your request and will arrive during the time slot you selected. Please keep your parcel packed and ready for collection. | `[]` | — |
| `pickup_verification_complete` | Your parcel has been weighed and verified by our pickup partner. The final price for your shipment is ₹{{1}}. This is the amount payable for collection. | `["verifiedPrice"]` | 926.00 |
| `payment_collected` | We have received your payment of ₹{{1}} for your shipment with NationWide Logistics. Thank you. Your GST invoice will follow separately. | `["amount"]` | 808.00 |
| `order_created_from_pickup` | Your parcel has been accepted and your order with NationWide Logistics has been created. Your tracking number is {{1}}. We will update you as your shipment moves. | `["trackingNumber"]` | NW-26-000123 |
| `pickup_rejected` | We were unable to accept your parcel at pickup. Reason: {{1}}. Please reply to this message and our team will help you resolve this and arrange a new pickup. | `["reason"]` | Restricted item |

### `invoice_ready` needs a document header

It is the only one carrying an attachment. Create it with **Header → Media → Document**, and give a
sample PDF when asked. A template approved with a text header (or none) cannot carry the invoice —
Gupshup rejects the send at runtime, the queue retries, and the notification ends up `FAILED`.

The three templates with no variables (`params: []`) still need an entry in `GUPSHUP_TEMPLATES` to
be used; an empty array is correct, not a reason to leave them out.

## The full config, once everything is approved

Keep it on one line in the environment; it is read and parsed at send time.

```json
{
  "invoice_ready":                { "id": "...", "params": ["customerName", "invoiceNumber", "amount"] },
  "order_confirmation":           { "id": "...", "params": ["trackingNumber"] },
  "tracking_number_assigned":     { "id": "...", "params": ["trackingNumber"] },
  "pickup_confirmation":          { "id": "...", "params": ["trackingNumber"] },
  "in_transit_update":            { "id": "...", "params": ["trackingNumber"] },
  "out_for_delivery":             { "id": "...", "params": ["trackingNumber"] },
  "delivered":                    { "id": "...", "params": ["trackingNumber"] },
  "delivery_exception":           { "id": "...", "params": ["trackingNumber"] },
  "quote_ready":                  { "id": "...", "params": ["amount"] },
  "quote_rejected":               { "id": "...", "params": ["reason"] },
  "pickup_or_dropoff_confirmed":  { "id": "...", "params": ["status"] },
  "pickup_request_needed":        { "id": "...", "params": [] },
  "pickup_request_received":      { "id": "...", "params": [] },
  "pickup_partner_assigned":      { "id": "...", "params": [] },
  "pickup_verification_complete": { "id": "...", "params": ["verifiedPrice"] },
  "payment_collected":            { "id": "...", "params": ["amount"] },
  "order_created_from_pickup":    { "id": "...", "params": ["trackingNumber"] },
  "pickup_rejected":              { "id": "...", "params": ["reason"] }
}
```

## Checking it worked

- The backend logs which adapter is live at boot. It must say the Gupshup adapter, not the stub.
- A malformed `GUPSHUP_TEMPLATES` throws rather than silently downgrading to free-form — that is
  deliberate, because a silent downgrade passes in testing (you have just messaged the number, so
  your own 24-hour window is open) and fails in production.
- Amounts are passed as plain numbers, so put the `₹` in the template body, not in the variable.

## Still missing: delivery receipts

Nothing reports back whether a message was delivered or read. `WhatsAppWebhookController` speaks
Meta's Cloud API callback format; Gupshup posts its own. Notifications stay at `SENT` regardless of
what actually happened. Sending is unaffected. See `docs/DEPLOYMENT.md`.
