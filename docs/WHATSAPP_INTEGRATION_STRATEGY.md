# WhatsApp Automation Strategy — NationWide Logistics

**Prepared:** August 2026 · **Status:** Research + architecture recommendation, pre-implementation
**Grounding:** This report is written against NationWide's actual codebase, not a hypothetical
platform. Sections 11–15 in particular describe what is *already built* (a working adapter
pattern, a BullMQ notification queue, a webhook endpoint, a `Notification` table) versus what's
still a stub or missing — see each section's "Current state" callout.

---

## 1. Executive Summary

NationWide already has the right shape of architecture for WhatsApp — an adapter interface
(`MessagingProvider`), a registry that resolves a channel to a concrete adapter
(`MessagingAdapterRegistry`), a BullMQ-backed queue (`NotificationsService`/
`NotificationsProcessor`), a `Notification` table tracking delivery lifecycle, and a webhook
controller at `/api/v1/webhooks/whatsapp`. What's missing is the *real* Meta Cloud API adapter
(today it's `StubWhatsAppAdapter`), inbound message handling (the webhook only processes delivery
*status* callbacks, not incoming customer messages), webhook signature verification, a real WABA,
approved templates, and consent tracking specific to WhatsApp (the existing `consentGivenAt`/
`consentSource` fields on `Customer` are DPDP data-processing consent, not WhatsApp messaging
opt-in — these need to be treated as separate).

**Recommendation:** Use Meta's WhatsApp Cloud API through a **BSP that supports Embedded Signup**
(360dialog or Gupshup — see Section 4), not a direct, BSP-free Meta integration, and not a
CRM-style all-in-one platform (WATI/Interakt/AiSensy) as the system of record — those are built
for marketers running broadcast campaigns from their own dashboard, not for a backend that already
owns its own order/customer data model and needs raw API access. Structure WhatsApp as a
**channel adapter inside the existing `notifications` module** (already the case), not a
standalone microservice or a separate "communication module." Fixed monthly cost at NationWide's
current ~250 shipments/month is roughly **$15–60/month all-in** (Meta message costs + BSP platform
fee), scaling close to linearly with shipment volume — see Section 5 for the full breakdown.

The two things that will actually determine success are not technical: (1) getting Meta Business
Verification done correctly the first time (a mismatched legal name is the single most common
cause of multi-week delays), and (2) template category discipline — sending a promotional message
through a Utility template gets templates paused or the number quality-rated down, which is a real
operational risk for a logistics company that depends on delivery notifications actually arriving.

---

## 2. WhatsApp Business Platform Overview

| Component | What it is | Does NationWide need it? |
|---|---|---|
| **WhatsApp Business Platform (Cloud API)** | Meta-hosted API for programmatic sending/receiving. This is "the API" — no server to run yourself (the old on-premise Business API client was retired). | **Yes — this is the whole integration.** |
| **WhatsApp Business App** | Free consumer app for small businesses to chat manually from a phone. Not an API. | No, except transiently: if NationWide's ops team is already using a number on this app, Meta's **Coexistence** feature (available since May 2025) lets that same number connect to the Cloud API without losing chat history, useful only during a migration window. |
| **Meta Business Portfolio** (formerly "Business Manager") | The umbrella account holding your verified business identity, WABAs, ad accounts, apps. One Business Portfolio can own multiple WABAs. | **Yes — required.** This is the account structure everything else attaches to. |
| **WhatsApp Business Account (WABA)** | The container for one or more phone numbers, holding templates, quality rating, messaging limits, and billing. | **Yes — one WABA**, holding NationWide's one production number (Section 7). |
| **Phone Number** | The number customers see and message. Registered to exactly one WABA at a time. | **Yes — a dedicated number**, see Section 7 for why not an existing/shared one. |
| **Business verification** | Meta's KYB (know-your-business) process — legal name, address, documents. | **Yes — required** before message-sending limits go above the lowest tier and before a real display name is approved. |
| **Display name** | The name shown next to the checkmark in the chat header (e.g. "NationWide Logistics"). Reviewed separately from business verification. | **Yes — required**, must match the verified business identity closely enough to pass review. |
| **Official Business Account (OBA / blue check)** | A higher trust tier: requires the WABA to be registered 30+ days and meeting additional Meta criteria. | Not required for Phase 1 — nice-to-have once volume and account age qualify. |

**What changed recently (verify before implementation, don't assume this report is still current
by the time you build):** Meta moved WhatsApp pricing from **per-conversation to per-message
billing effective July 1, 2025** — nearly every article written before that date describing "24-hour
conversation windows" as a *pricing* unit is now describing something that's still true
operationally (Section 6) but no longer how billing works. Meta also enabled **Coexistence**
(May 2025) and simplified **Embedded Signup** as the standard onboarding path through a BSP.

Sources: [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [Meta — Official Business Accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/), [Meta — Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)

---

## 3. Meta Cloud API vs BSP

### Option A — Direct Meta Cloud API (no BSP)

You register the WABA and phone number yourself in Meta's Developer Console, manage app creation,
access token lifecycle, webhook endpoints, and template submission entirely through Meta's own
tooling.

**Pros:** zero platform markup on message costs; no third-party dependency for the core sending
path; full control.
**Cons:** you own 100% of the operational burden — token refresh, rate-limit handling, template
submission UX (Meta's own tooling is developer-oriented, not built for a non-technical admin to
manage templates day-to-day), and you get none of the extras (agent inbox, broadcast tooling,
analytics dashboard) that a BSP bundles. Support is Meta's own developer support, which is slower
and less hands-on than a BSP's.

### Option B — WhatsApp Business Solution Provider (BSP)

A Meta-authorized partner sits between your backend and Meta's API. You still use the same Cloud
API surface (webhooks, template send calls) — a BSP does **not** replace the API, it operates
Meta's infrastructure on your behalf and usually adds a dashboard, inbox, and per-message markup.

**Pros:** faster onboarding (many offer Embedded Signup wizards that complete WABA setup in
minutes), a usable non-technical admin UI for templates/broadcasts, dedicated support, sometimes
bundled analytics.
**Cons:** a markup on every message (Section 5), and depending on the BSP, some vendor lock-in
risk if they don't support Embedded Signup (older-style BSP integrations sometimes retained more
control over the WABA than the business itself).

**Critical fact for the lock-in question:** with Embedded Signup (the modern standard, which every
credible BSP now supports), **the WABA, phone number, and Business Portfolio are owned by
NationWide**, not the BSP — the BSP is granted API access to a WABA the business itself owns.
Migrating to a different BSP, or to direct Cloud API access, keeps the same phone number and does
not require re-verification, provided both the source and destination are under the same verified
Meta Business Manager. Technical transfer takes roughly 15–60 minutes once both sides approve; full
cutover including rebuilding any BSP-specific automation typically takes 1–3 business days.

Sources: [Meta — Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/), [Respond.io — Phone Number Migration to WhatsApp Cloud API](https://respond.io/help/whatsapp/phone-number-migration-to-whatsapp-cloud-api), [Interakt — migrating from BSP](https://www.interakt.shop/resource-center/whatsapp-business-api-migrating-from-bsp/)

### Provider comparison (India-relevant)

| Provider | Model | Markup on Meta rate | Monthly fee | Strengths | Fit for NationWide |
|---|---|---|---|---|---|
| **360dialog** | Direct Meta Tech Provider | **Zero markup** — Meta's rate passed through exactly, flat platform fee on top | From €49/mo | Raw API access, multi-WABA capable, fastest launch (3–7 days), built for developers who already have their own backend | **Best fit** — NationWide doesn't need a BSP's inbox/broadcast UI since the admin dashboard already built this session (rate cards, order management) is the natural home for any WhatsApp admin UI too |
| **Gupshup** | BSP with per-message markup | ~$0.001/message flat markup + optional Conversation Studio fees | Usage-based, no fixed fee on self-serve tier | Deepest India/APAC volume discounts, mature platform, large enterprise track record | Strong alternative if NationWide later wants Gupshup's bundled tools (IVR, RCS) — otherwise the markup adds up at scale with no offsetting benefit for an org with its own backend |
| **Twilio** | BSP with flat markup | Flat $0.005/message (in + out) | Pay-as-you-go, no fixed fee | Best-in-class API docs, huge ecosystem, reliable | Markup is the highest of the direct-API options studied here (~$250/mo just in markup at 50K messages/month) — good for teams already on Twilio for SMS, not a compelling reason to start there |
| **AiSensy / Interakt / WATI** | All-in-one SaaS (dashboard-first) | Bundled into subscription tiers (₹1,500–6,000+/mo) | Fixed monthly + per-message | Non-technical broadcast/campaign tooling, Shopify/CRM integrations, built-in chatbot builders | **Not recommended as the system of record** — these are built for teams *without* their own backend to run marketing campaigns from a dashboard. NationWide already has customer/order data and an admin portal; paying for a second, parallel CRM-style tool duplicates data and adds a sync problem for no benefit. Could be reconsidered later purely for *marketing broadcast* campaigns (re-engagement, promotions) if that becomes a real business need distinct from transactional notifications. |

**Recommendation: 360dialog.** Zero markup keeps the cost model simple and close to Meta's own
numbers (Section 5), it's built for exactly NationWide's situation (a real backend that wants raw
API access, not a dashboard to replace one), and Embedded Signup means no lock-in risk beyond the
normal effort of switching any vendor. Gupshup is the credible fallback if 360dialog's support or
reliability disappoints in practice — same "own your WABA" guarantee applies.

Sources: [360dialog Pricing](https://360dialog.com/pricing), [Gupshup pricing analysis](https://codingclave.com/blog/gupshup-whatsapp-pricing-india-2026), [Twilio WhatsApp pricing analysis](https://setsmart.io/blog/whatsapp-business-api-pricing), [AiSensy vs Interakt vs WATI](https://aisensy.com/aisensy-vs-interakt-vs-wati)

---

## 4. Recommended Provider — Summary

**360dialog**, via Embedded Signup, as a thin BSP layer over the Cloud API. NationWide's own
backend remains the system of record for templates, message logs, and customer conversation state
(Sections 12–13) — 360dialog is purely the transport, not a second database of customer
communication.

---

## 5. Pricing & Cost Analysis

### How Meta actually charges (as of this report, verify before committing)

Per Meta's own pricing documentation: pricing moved from per-conversation to **per-message billing
effective July 1, 2025**. There is no free tier for Marketing, Utility (outside an open window), or
Authentication template messages — they're charged from the first message, at a rate that depends
on the **recipient's** country code and a volume tier (higher monthly volume can improve authentication
rates). **Service messages (free-form replies within an open customer-service window) are free**,
and **Utility templates sent inside that same open window are also free** — this became free
effective November 1, 2024, per Meta's official pricing page, and remains the current state per
that source. (Some third-party blogs found during this research claimed an "October 1" change that
would start charging for service messages and in-window utility templates — Meta's own
documentation, fetched directly for this report, does not currently state that. **Re-verify this
specific point against the live Meta pricing page immediately before building cost projections
into the business plan** — third-party WhatsApp pricing blogs have a track record of being stale
or speculative, and Meta has changed this model before.)

India-specific: Meta introduced a marketing-rate increase effective January 1, 2026, a higher
authentication-international rate effective April 1, 2026, and India-specific INR billing
localization with a migration deadline of December 31, 2026.

**Illustrative current India rates** (per delivered message, approximate — confirm against Meta's
live rate card, which varies by volume tier):

| Category | Approx. rate (India) |
|---|---|
| Marketing | ~$0.011–0.012 (~₹0.86–0.90) |
| Utility (outside open window) | ~$0.0014 (~₹0.115) |
| Authentication | ~$0.0014–0.002 (~₹0.115–0.16), higher for international recipients |
| Utility inside an open customer-service window | **Free** |
| Free-form service message (any content, inside window) | **Free** |

Sources: [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [WhatsApp API Pricing India rate card summary](https://whautomate.com/whatsapp-business-api-pricing-india), [engagelab 2026 pricing guide](https://www.engagelab.com/blog/whatsapp-business-api-pricing)

### NationWide's actual message mix

Every one of the messages NationWide would send is a **transactional/order-status update** —
pickup confirmation, pickup reminder, pickup completed, payment confirmation, shipment
confirmation, tracking updates, delivery confirmation. **All of these are Utility category, not
Marketing** (Section 8 explains why). This matters enormously for cost: Utility is roughly **8x
cheaper per message than Marketing** in India, and if the customer replies at any point (very
plausible — "where's my parcel," "can I change pickup time"), every subsequent utility message
sent within that 24-hour window is **free**.

### Cost model

Assume, conservatively, that a customer's inbound reply does *not* happen (worst case — every
message is a business-initiated, outside-window Utility template):

**Messages per shipment (customer-facing):**
1. Quote ready (if manual review needed)
2. Pickup request received
3. Pickup partner assigned
4. Pickup reminder
5. Pickup verified / weight confirmed
6. Payment received
7. Order confirmed / shipment created (tracking number assigned)
8. Tracking update (in transit) — sent selectively, not per carrier event (Section 17)
9. Out for delivery
10. Delivered

That's up to **10 utility messages per shipment** in the worst case (no free in-window messages).
In practice, NationWide's existing `NOTIFICATION_TEMPLATES` already dedupes several of these into
one lifecycle (e.g. `PICKUP_VERIFICATION_COMPLETE` and `PAYMENT_COLLECTED` fire close together),
so 6–8 messages/shipment is a realistic average.

| Volume tier | Shipments/mo | Utility msgs/shipment (avg) | Total utility msgs | Meta cost (India, ~$0.0014/msg) | 360dialog platform fee | **Total/mo** |
|---|---|---|---|---|---|---|
| **Low** (current) | 250 | 7 | 1,750 | ~$2.45 | ~€49 (~$53) | **~$55/mo** |
| **Medium** | 1,000 | 7 | 7,000 | ~$9.80 | ~€49–99 (~$53–107) | **~$63–117/mo** |
| **High** | 5,000 | 7 | 35,000 | ~$49 | ~€99+ (~$107+, likely a higher tier) | **~$156+/mo** |

**Cost breakdown by owner:**
- **Meta cost**: the per-message rate above — this is the true floor, unavoidable regardless of
  provider (Meta charges the same rate whether you go direct or through a BSP with zero markup).
- **BSP/platform cost**: 360dialog's flat monthly fee (no per-message markup at zero-markup
  pricing) — this dominates the total at NationWide's current volume, since Meta's utility rate is
  so low. At higher volume a markup-based BSP (Gupshup, Twilio) would scale worse than 360dialog's
  flat fee.
- **Our infrastructure cost**: effectively **$0 incremental** — the queue (BullMQ/Redis),
  database (Postgres), and backend (NestJS) are already running for the rest of the platform;
  WhatsApp adds one more adapter and a handful of new tables, not new infrastructure.

**If marketing/re-engagement campaigns are added later** (not in Phase 1 scope), each Marketing
message costs roughly 8x a Utility message in India (~$0.011 vs ~$0.0014) — budget separately and
deliberately, since this is the category Meta reviews most strictly for opt-in evidence.

---

## 6. Business Verification Requirements

Step-by-step, based on Meta's current onboarding flow:

1. **Create a Meta Business Portfolio** (business.facebook.com) if NationWide doesn't already have
   one from any other Meta product (ads, Instagram, etc.).
2. **Start Business Verification** inside that portfolio: legal business name (must match
   documents exactly — this is the single most common cause of delay), registered address,
   business phone number, business website, business email on the same domain as the website
   (domain verification via DNS TXT record or file upload).
3. **Upload company documents**: certificate of incorporation / GST registration / equivalent
   government business registration proving the legal entity and address. Exact accepted document
   types are listed live in the Business Verification flow — confirm current list at
   submission time rather than assuming.
4. **Create the WABA** inside the verified portfolio.
5. **Register the phone number** (Section 7) — SMS or voice OTP verification.
6. **Submit the display name** ("NationWide Logistics" or similar) for review — reviewed
   separately from business verification, must plausibly represent the verified business.
7. **Submit initial templates** for approval (Section 9) — can happen in parallel with steps 3–6.
8. **Connect via a BSP's Embedded Signup flow** (if using 360dialog, as recommended) — this
   handles steps 4–5 through a guided wizard once the Business Portfolio is verified.

**Realistic timeline**: 2–4 days for business verification once documents are correct, a few hours
for WABA/number setup once verification clears, 24–48 hours for first template approvals — call it
**3–10 business days end-to-end**, with the legal-name mismatch being the most common cause of it
taking longer.

Sources: [Meta — Official Business Accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/), [WABA onboarding requirements 2026 summary](https://www.intellicon.io/whatsapp-business-api-requirements-checklist/)

---

## 7. Phone Number Requirements

- **Can we use an existing business number?** Only if it's not currently registered on the
  WhatsApp Business *App* — or if it is, only via the Coexistence path (connects the same number
  to both the app and the Cloud API simultaneously, preserving chat history). A number previously
  deleted from WhatsApp entirely can be freshly registered.
- **Mobile vs landline?** Mobile numbers are the safest choice — fully supported everywhere, both
  SMS and voice-call verification work. Landline numbers are technically supported by the Cloud
  API but can only verify via voice call (no SMS), narrowing the verification path and adding
  friction.
- **VoIP/virtual numbers, toll-free, premium-rate, universal-access numbers**: **not supported**.
- **Requirement**: the business must own the number outright, it must include full country + area
  code, and it must be able to receive an international voice call for verification.
- **Later migration to a different BSP or direct API**: fully supported without losing the number,
  as covered in Section 3, as long as everything stays under the same verified Meta Business
  Manager.

**Recommendation**: **purchase a dedicated mobile number specifically for this WABA** — not an
existing staff/office line, and not a number already on the WhatsApp Business App. This avoids the
entire Coexistence complexity, avoids any risk to an existing number's chat history, and keeps the
production WhatsApp number cleanly separated from any personal/internal use that could affect
message quality rating. A prepaid SIM or a virtual-mobile-number product that supports real SMS/
voice OTP (not a pure VoIP/toll-free number) is sufficient — it only needs to receive the one-time
verification call/SMS during setup.

Sources: [Meta — Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers), [Sinch — landline for WhatsApp Business](https://sinch.com/blog/whatsapp-business-using-landline/)

---

## 8. WhatsApp Messaging Rules

### The four template categories

| Category | Purpose | Review strictness | Approx. India cost |
|---|---|---|---|
| **Utility** | Transactional updates tied to a specific transaction the customer already has with you: order confirmations, shipping/pickup updates, payment confirmations | Easiest to get approved | ~$0.0014/msg (free in-window) |
| **Authentication** | OTPs / login codes only, rigid Meta-provided format | Strict format rules, otherwise straightforward | ~$0.0014–0.002/msg |
| **Marketing** | Anything commercial or engagement-driving: promotions, offers, re-engagement, newsletters | Strictest review — checks for opt-in evidence and relevance | ~$0.011/msg |
| **Service** (not a template category — a message *type*) | Free-form, non-template replies sent inside an open 24-hour customer-service window | N/A — no approval needed, but only usable inside the window | Free |

### The 24-hour customer-service window (operational rule, not a pricing rule post-2025)

When a customer sends NationWide's WABA any inbound message, a 24-hour window opens. Inside it,
free-form text/images/documents/quick-replies can be sent without a template. Each new inbound
message resets the 24 hours. Once the window closes, only an approved template can re-initiate
contact. A special case: if the customer messages in via a click-to-WhatsApp ad or Facebook Page
CTA, a 72-hour **free entry-point conversation** opens instead.

### NationWide's specific messages, categorized

| Message | Category | Why |
|---|---|---|
| "Your pickup request has been received." | **Utility** | Transactional confirmation of an action the customer just took |
| "Your pickup is scheduled for tomorrow between 9 AM and 12 PM." | **Utility** | Status update on an existing transaction |
| "Our pickup partner has arrived." | **Utility** | Real-time transactional status |
| Payment confirmation | **Utility** | Receipt-style transactional message |
| Shipment created / tracking number assigned | **Utility** | Transactional confirmation |
| Tracking update (in transit / customs / out for delivery) | **Utility** | Status update tied to an existing order |
| Shipment delivered | **Utility** | Transactional completion notice |
| "Get 10% off your next shipment" / any promo, re-engagement, or newsletter-style content | **Marketing** | Commercial intent, requires marketing-specific opt-in evidence |
| OTP for login/password reset (if ever added) | **Authentication** | Meta's fixed OTP format |

**None of NationWide's current planned messages are Marketing.** This is good news for cost and
approval friction — keep it that way deliberately. The moment a "here's a discount" or "refer a
friend" message gets added to an existing Utility-approved template, Meta's automated
re-categorization will catch the mismatch (it runs a recurring process specifically to detect
miscategorized templates) and can pause the template or require Marketing opt-in retroactively.
**Never blend promotional content into a transactional template** — create a separate Marketing
template and gate it behind separate opt-in (Section 10) if that need ever arises.

Sources: [Meta — Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization), [Wati — template categories explained](https://support.wati.io/en/articles/11463465-whatsapp-template-categories-explained-utility-authentication-and-marketing), [Sprout Social — 24-hour rule](https://support.sproutsocial.com/hc/en-us/articles/5343786902669-What-is-the-WhatsApp-24-hour-rule)

---

## 9. Template Strategy

### Template mechanics

- **Creation & approval**: submitted per-WABA via Meta's template tooling (or the BSP's UI, which
  wraps the same submission). Review typically completes in 24–48 hours.
- **Variables**: `{{1}}`, `{{2}}`, etc. placeholders in body text, filled at send time. Meta
  requires realistic sample values at submission time, and flags templates that open or close
  entirely on a variable (no surrounding static text) as a common rejection reason.
- **Buttons**: Quick Reply (postback, e.g. "Track my order" / "Contact support") and
  Call-to-Action buttons (URL button linking to the tracking page, or a Call button dialing
  NationWide's support line). Up to a small fixed number of buttons per template (verify the
  current limit in Meta's template builder at implementation time — this specific number has
  changed in the platform's history).
- **Media templates**: header can carry an image/document (e.g. a shipping label attachment,
  though NationWide's current PDF rate-card generation could plausibly extend here later — out of
  Phase 1 scope).
- **Naming**: lowercase, underscore-separated, must be descriptive of actual content (Meta
  rejects generic or misleading names).
- **Common rejection reasons**: category mismatch (promotional content in a Utility template),
  vague/generic wording that could apply to any business, missing or unrealistic sample variable
  values, exceeding character limits, requesting sensitive personal data in the message body.

### Recommended template list

Cross-referenced against NationWide's **existing** `NOTIFICATION_TEMPLATES` constant
(`backend/src/modules/notifications/templates.ts`) — that file already defines the template
*names* the codebase will call; this section maps each to what should actually be submitted to
Meta, and flags which ones can be merged or are genuinely unnecessary.

| Existing code constant | Recommended Meta template | Category | Notes |
|---|---|---|---|
| `PICKUP_REQUEST_RECEIVED` | `pickup_request_received` | Utility | Confirms submission, matches the exact confirmation copy already used in the pickup-request UI |
| `PICKUP_PARTNER_ASSIGNED` | `pickup_partner_assigned` | Utility | Include partner name + pickup window as variables |
| `PICKUP_VERIFICATION_COMPLETE` | `pickup_verification_complete` | Utility | Fires after weight verification — consider merging with `PAYMENT_COLLECTED` into one message if they always happen together operationally, to cut message count |
| `PAYMENT_COLLECTED` | `payment_collected` | Utility | Include amount + method as variables |
| `ORDER_CREATED_FROM_PICKUP` / `ORDER_CONFIRMATION` | `order_confirmation` | Utility | One template covers both existing constants — they represent the same customer-facing event (order + tracking number now exist) |
| `TRACKING_NUMBER_ASSIGNED` | *(merge into `order_confirmation` above)* | — | Sending this separately from order confirmation is very likely one message too many — the tracking number should just be a variable inside the order-confirmation template |
| `PICKED_UP` | `pickup_confirmation` | Utility | Tracking-status-driven, not pickup-request-driven — see Section 17 for why this is distinct from `PICKUP_VERIFICATION_COMPLETE` |
| `IN_TRANSIT` | `in_transit_update` | Utility | **Send selectively, not on every carrier ping** — Section 17 |
| `OUT_FOR_DELIVERY` | `out_for_delivery` | Utility | High-value, low-frequency — safe to always send |
| `DELIVERED` | `delivered` | Utility | Always send — this is the message customers most want |
| `EXCEPTION` | `delivery_exception` | Utility | Always send — exceptions need to reach the customer immediately, and ideally push them into the free-form window by inviting a reply ("Reply to this message if you have questions") |
| `QUOTE_READY` | `quote_ready` | Utility | Transactional — it's a response to a request the customer initiated |
| `QUOTE_REJECTED` | `quote_rejected` | Utility | Same reasoning |
| `PICKUP_REQUEST_NEEDED` | `pickup_request_needed` | Utility | Nudge after quote acceptance — still transactional (prompting completion of an in-progress transaction), not marketing |
| `PICKUP_REJECTED` | `pickup_rejected` | Utility | Rare path but customer needs to know |
| *(not yet in code — recommend adding)* | `pickup_reminder` | Utility | The customer-facing "tomorrow between 9–12" reminder called out explicitly in the master prompt — doesn't exist as a named constant yet, worth adding alongside `PICKUP_PARTNER_ASSIGNED` |

**Not recommended for Phase 1**: `quote_expiring`, `shipment_delayed` as a distinct category from
`delivery_exception` — these add template-approval overhead without a clear distinct customer
action, and can be folded into the exception/reminder templates above once real usage data shows
they're needed as their own thing.

---

## 10. Opt-In / Opt-Out

**Current state**: NationWide's `Customer` model has `consentGivenAt`/`consentSource` — this is
DPDP data-processing consent captured at signup, **not** WhatsApp-specific messaging opt-in. Meta
requires businesses to have obtained a distinct opt-in specifically for WhatsApp messaging, stating
the business name and that the person is opting in to receive WhatsApp messages. Since November
2024, a general marketing opt-in doesn't need to name "WhatsApp" specifically, but the two consents
(DPDP data processing vs. WhatsApp messaging) should still be modeled as separate facts, because
they can be withdrawn independently and Meta's policy enforcement looks specifically for WhatsApp
opt-in evidence if a customer reports the number.

**Recommended model**:
- A **new field set on `Customer`** (or a small related table if per-channel consent history
  matters — recommended, since a customer could opt in, opt out, and opt back in over time):
  `whatsappOptInAt`, `whatsappOptInSource` (`signup_form` | `pickup_request_form` | `staff_entry`),
  `whatsappOptOutAt`.
- **Checkbox at signup and at pickup-request submission** (the two natural points a phone number
  is collected), pre-unchecked (never pre-checked — that's not a valid opt-in under Meta's
  policy or India's DPDP Act), with text along the lines of: *"I agree to receive order and
  shipment updates from NationWide Logistics on WhatsApp."* This single checkbox can cover all of
  NationWide's Utility messages (order/pickup/tracking updates) since they're all the same
  message *category* the customer is consenting to — a separate, explicit opt-in would only be
  needed if Marketing messages are ever added later.
- **STOP handling**: WhatsApp itself provides an automatic "Stop promotions" control on the
  customer's side for Marketing messages; for Utility messages (which is all NationWide sends),
  build an explicit reply-based opt-out too — the inbound webhook handler (Section 12/14) should
  recognize `STOP`/`UNSUBSCRIBE` (case-insensitive) as a command, set `whatsappOptOutAt`
  immediately, and the `NotificationsService.enqueue()` call should check that field and skip
  enqueueing (not silently fail later) for any opted-out customer.
- **Never send after opt-out**: enforce this at the single choke point where all WhatsApp sends
  originate (`NotificationsService.enqueue`), not per-caller — every one of the ~15 call sites
  across the codebase that could trigger a WhatsApp notification should not need to remember to
  check consent individually.

Sources: [Meta — Get opt-in for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)

---

## 11. NationWide WhatsApp Architecture

**Current state**: this is already built correctly. WhatsApp lives inside the existing
`notifications` module as one channel among others (`NotificationChannel` enum), not a standalone
service or microservice — exactly the right call for this platform's size. Keep it that way.

```
Frontend
   │
   ▼
NestJS Backend (existing modules: orders, pickup-requests, quotes, tracking, ...)
   │  domain events / direct calls
   ▼
NotificationsService.enqueue(customerId, channel, template, variables)
   │  writes a QUEUED Notification row, then enqueues a BullMQ job
   ▼
BullMQ Queue ("notifications")
   │
   ▼
NotificationsProcessor (worker)
   │  resolves the adapter for the channel via MessagingAdapterRegistry
   ▼
MessagingProvider interface
   │  concrete implementation:
   ▼
WhatsAppCloudApiAdapter  (replaces StubWhatsAppAdapter)
   │  HTTPS call, either direct to graph.facebook.com or via 360dialog's endpoint
   ▼
Meta WhatsApp Cloud API  →  WhatsApp
```

And the inbound/status direction:

```
WhatsApp
   │
   ▼
Meta Cloud API  →  POST webhook
   │
   ▼
WhatsAppWebhookController  (POST /api/v1/webhooks/whatsapp)
   │  signature verification (missing today — Section 18)
   │  distinguish: delivery status update vs. inbound customer message (only status is handled today)
   ▼
NotificationsService.recordDeliveryStatus()     [existing]
   or
InboundMessageService.handle()                  [new, Section 14]
   │
   ▼
Database (Notification, and new WhatsAppInboundMessage / conversation tables)
```

**Should it be a standalone module, a notification service, or a dedicated communication
module?** A **channel inside the existing notification service** — confirmed correct by what's
already built. A standalone "communication module" would be premature abstraction for a platform
sending one channel (WhatsApp) with one direction of business-triggered sends; splitting it out
only makes sense if NationWide later adds SMS/email as equally central channels with their own
complex routing logic, which isn't the case today.

---

## 12. Event-Driven Automation

**Current state**: mostly already event-driven in spirit — `OrdersService`, `PickupRequestsService`,
etc. call `notificationsService.enqueue(...)` directly at the point a state transition happens,
rather than scattering raw WhatsApp API calls through controllers. That's the right pattern; it's
not using a formal in-process event bus (e.g. NestJS `EventEmitter2`) today, calls are direct
method invocations from the service that owns the transition. That's a reasonable Phase 1 choice —
introducing a full event bus is not justified yet (see note below).

| Event | Where it already fires (or should) | Template |
|---|---|---|
| `PICKUP_REQUEST_CREATED` | `PickupRequestsService.create()` | `pickup_request_received` |
| `PICKUP_PARTNER_ASSIGNED` | `PickupRequestsService.assignPartner()` | `pickup_partner_assigned` |
| `PICKUP_REMINDER_DUE` | **New** — needs a scheduled job (BullMQ repeatable job or cron), not a state transition | `pickup_reminder` |
| `PICKUP_STARTED` / partner en route | Not currently modeled as a distinct state — optional, low priority | — |
| `PICKUP_COMPLETED` (weight verified) | `PickupRequestsService.verify()` | `pickup_verification_complete` |
| `PAYMENT_RECEIVED` | `PickupRequestsService.collectPayment()` | `payment_collected` |
| `ORDER_CREATED` | `PickupRequestsService.acceptParcel()` → `OrdersService.createOrderWithShipment()` | `order_confirmation` (with tracking number as a variable) |
| `TRACKING_UPDATED` | `TrackingService.persistNewEvents()` | selectively, per Section 17 |
| `OUT_FOR_DELIVERY` | Tracking status change to `OUT_FOR_DELIVERY` | `out_for_delivery` |
| `DELIVERED` | Tracking status change to `DELIVERED` | `delivered` |
| `EXCEPTION_OCCURRED` | Tracking status change to `EXCEPTION`, or manual admin override | `delivery_exception` |

**Should NationWide adopt a formal event bus (e.g. `EventEmitter2`, or a `DomainEvents` pattern)?**
Not yet. The current pattern — the service that owns a state transition directly calls
`notificationsService.enqueue()` — is simple, traceable (a developer reading
`PickupRequestsService.collectPayment()` sees the notification call right there, no indirection),
and matches the codebase's existing conventions. Introduce a real event bus only if/when a second
consumer of the same domain event appears (e.g. WhatsApp *and* an internal Slack alert *and* an
analytics event all needing to react to `PAYMENT_RECEIVED` independently) — until then, a formal
event system is complexity NationWide would be paying for without using.

---

## 13. Queue Architecture (BullMQ)

**Current state**: already production-shaped. `NotificationsService.enqueue()` creates a `QUEUED`
`Notification` row *before* enqueueing the BullMQ job (so the row exists even if the queue add
itself fails), then adds a job with `{ attempts: 3, backoff: { type: 'exponential', delay: 2000 } }`.
The processor (`NotificationsProcessor`) already handles the missing-row-on-process case as a
no-op rather than an error (a notification whose customer/order was deleted between enqueue and
processing), and has an `onFailed` handler that only marks the notification permanently `FAILED`
once BullMQ has exhausted all retry attempts — not on every transient failure. Both the `Queue` and
`Worker` have `error` event listeners (required — an unhandled `error` event on either crashes the
whole Node process).

**What to add when the real adapter replaces the stub:**

- **Idempotency**: use the `Notification.id` (or a request-scoped idempotency key) as the BullMQ
  job ID so a duplicate `enqueue()` call for the same logical event (e.g. a retried HTTP request
  upstream) doesn't create two jobs. Not currently enforced — worth adding once real money-costing
  messages are on the line.
- **Duplicate prevention on the Meta side**: Meta's own API doesn't dedupe sends — sending the same
  template twice with the same content is two billed messages. The idempotency key above is the
  actual guard.
- **Rate limiting**: BullMQ's built-in `limiter` option on the queue/worker should be set to stay
  under Meta's per-number messaging-tier throughput limit (the current tier thresholds are listed
  live in Meta's messaging-limits documentation and change based on the number's quality rating —
  confirm the exact number before going live, don't hardcode last year's figures).
- **Message ordering**: not critical for NationWide's use case — a slightly-out-of-order
  `pickup_partner_assigned` vs `pickup_reminder` is a minor UX issue, not a correctness one. BullMQ
  doesn't guarantee strict ordering across jobs anyway; don't design around an assumption it does.
- **Dead-letter handling**: BullMQ's failed-job list already serves this role — a job that
  exhausts all 3 attempts stays in the failed set (inspectable via Bull Board or the Redis CLI)
  rather than disappearing. Worth adding a lightweight admin-visible "failed WhatsApp messages"
  view (Section 19) rather than a separate DLQ mechanism.

---

## 14. Webhook Architecture

**Current state**: `POST /api/v1/webhooks/whatsapp` exists, handles the `GET` verification
handshake correctly (checks `hub.verify_token` against `WHATSAPP_WEBHOOK_VERIFY_TOKEN`), and
processes delivery-status callbacks (`sent`/`delivered`/`read`/`failed`) via
`extractStatusUpdates()`. It always returns `200` even for unrecognized payloads — correct, since
Meta retries aggressively on non-2xx and a malformed/unknown payload shape shouldn't trigger a
retry storm.

**Two concrete gaps, both already flagged in the code's own comments:**

1. **No signature verification.** The webhook controller's own doc comment says: *"a real
   deployment should also verify the `X-Hub-Signature-256` header using the Meta App Secret once
   one is issued."* This is a real gap today, safe only because the endpoint currently does nothing
   with unverified input beyond updating a status field by `providerMessageId` (a narrow blast
   radius). It becomes a real risk once inbound message handling (below) is added, since that path
   could trigger customer-visible side effects (auto-replies, order lookups). **Must be added
   before inbound handling goes live**: compute an HMAC-SHA256 over the raw request body using the
   Meta App Secret, compare against `X-Hub-Signature-256`, reject with 403 on mismatch — this needs
   the *raw* request body (not the parsed JSON), which means configuring the raw-body parser for
   this one route before NestJS's default JSON body-parsing consumes it.

2. **No inbound customer message handling.** `extractStatusUpdates()` only reads
   `entry[].changes[].value.statuses` — Meta's webhook payload for an inbound customer message
   uses a sibling field, `entry[].changes[].value.messages`, which the current code never looks at.
   Section 14 (Customer Conversations) below covers what needs to be added.

**Design for the rest**: idempotency — Meta can and does redeliver webhook events; the current
`recordDeliveryStatus()` uses `updateMany` keyed on `providerMessageId` (a no-op on an unmatched/
already-processed id), which is already correctly idempotent for the status-update path. The same
pattern (an `updateMany`/upsert keyed on Meta's own message ID, never a plain `create`) must carry
over to inbound message storage. Processing should stay synchronous inside the webhook handler
only for the cheap parts (parse, look up customer, persist) — anything that could be slow or
flaky (an auto-reply send, a manager-notification) should itself go through the BullMQ queue
rather than block the webhook response, since Meta expects a fast 200.

---

## 15. Database Design

**Current state**: `Notification` (outbound message lifecycle) already exists and is sufficient for
outbound tracking. Nothing exists yet for inbound messages, conversation grouping, or WhatsApp-
specific consent. Recommended additions:

### `WhatsAppInboundMessage` (new)
Purpose: durable record of every customer-sent WhatsApp message, independent of whether NationWide's
automation could do anything useful with it.

| Field | Notes |
|---|---|
| `id` | uuid pk |
| `customerId` | FK to `Customer`, nullable — a message from an unrecognized number should still be stored, not dropped |
| `fromPhone` | the raw sender number from the webhook payload, always stored even when `customerId` resolves, so a phone-number-changed customer's history stays intact |
| `providerMessageId` | Meta's `wamid` for the inbound message — **unique**, this is the idempotency key for redelivered webhooks |
| `body` | text content (nullable for non-text message types) |
| `messageType` | `text` \| `image` \| `document` \| `location` \| ... — Meta sends a type field |
| `relatedOrderId` / `relatedPickupRequestId` | nullable FKs — set by whatever conversation-context logic (Section 16) determines what the message is about |
| `handledBy` | `AUTOMATION` \| `STAFF` \| `UNHANDLED` |
| `receivedAt` | from the webhook payload's own timestamp, not `now()` — preserves true message time even if processing is delayed |
| `createdAt` | row insert time |

Indexes: unique on `providerMessageId`; index on `(customerId, receivedAt)` for conversation-history
lookups; index on `fromPhone` for the unrecognized-sender case.

### `WhatsAppConsent` (new — or fields directly on `Customer`, see Section 10)
If modeled as its own table rather than flat fields (recommended if consent needs a full history,
e.g. opted-in, opted-out, opted-in-again): `id`, `customerId`, `optedInAt`, `optOutAt` (nullable),
`source` (`signup_form` \| `pickup_request_form` \| `staff_entry` \| `whatsapp_stop_reply`),
`createdAt`. Unique constraint not needed (a customer can have multiple rows over time as they
opt in/out repeatedly) — query "currently opted in" as "latest row has no `optOutAt`."

### `Notification` (existing — no schema change needed)
Already covers outbound lifecycle correctly: `channel`, `template`, `status`, `providerMessageId`
(unique), `sentAt`/`deliveredAt`/`readAt`, `errorMessage`. No new entity needed here.

**Not recommended as separate entities** (would be over-engineering for Phase 1):
- `WhatsAppTemplate` table — template *names* and their mapping to internal event types are static
  code (`templates.ts`), not runtime data; a database table only earns its place once templates
  need to be created/edited from the admin UI rather than deployed as code, which isn't a Phase 1
  requirement.
- `WhatsAppWebhookEvent` as a generic raw-payload audit log, separate from
  `WhatsAppInboundMessage`/`Notification` — the two typed tables above already capture everything
  actionable; a third generic table just for "we received *something*" duplicates data without a
  clear consumer. Add it later only if webhook payload debugging in production turns out to need
  the raw JSON preserved (in which case, a `rawPayload jsonb` column added to
  `WhatsAppInboundMessage` covers the common case more cheaply than a whole separate table).
- `WhatsAppNotificationJob` — this is what `Notification` + BullMQ's own job store already is;
  a separate table would just be a worse copy of BullMQ's job state.

**Retention**: message *content* (`WhatsAppInboundMessage.body`) is personal data under DPDP —
apply the same retention policy NationWide already needs to define for `Notification`/`AuditLog`
content generally (this report doesn't invent a NationWide-specific number; that's a legal/policy
decision, not an engineering one — flag it to whoever owns DPDP compliance).

---

## 16. Customer Conversations

**Current gap**: no inbound handling exists at all today (Section 14). This section designs the
Phase 1 version — deliberately minimal.

**Recommended for Phase 1: rule-based, not AI, with human handoff as the default fallback.**

```
Inbound WhatsApp message
   │
   ▼
Signature-verified webhook → look up customer by fromPhone
   │
   ▼
Store as WhatsAppInboundMessage
   │
   ▼
Simple keyword/intent rules (Phase 1 scope):
   - "STOP" / "UNSUBSCRIBE"        → set whatsappOptOutAt, send confirmation, done
   - "TRACK" / a tracking number   → auto-reply with current tracking status (read-only, safe to automate — same data the public /track page already serves)
   - Reply within an active pickup's time window (e.g. to "your pickup is scheduled...") → tag the message with relatedPickupRequestId, notify the assigned admin/pickup partner rather than attempting to auto-resolve ("can I change the time" requires a human decision)
   - Anything else                 → tag UNHANDLED, surface in admin (Section 19), no auto-reply beyond an optional "we've received your message, our team will respond" utility-adjacent service message
```

**Why not a full chatbot or AI in Phase 1**: NationWide's actual conversation volume at 250
shipments/month is low enough that a human (the admin/ops team, who already has the full order
context in the existing admin portal) can handle real questions faster and more accurately than
building/maintaining an AI intent classifier would save. The two things worth automating now —
opt-out and tracking-status lookup — are both narrow, deterministic, and already backed by
existing read paths (`TrackingService`). Everything else genuinely needs a human who can see order
history, which the admin portal already provides once the message is tagged to the right order.

**What "AI chatbot" would look like later, if volume justifies it**: an LLM-based intent
classifier sitting between "store the inbound message" and "route to a human," trained/prompted
against NationWide's actual FAQ set (where's my order, can I reschedule, how much will this cost).
Not a Phase 1 recommendation — introduce only once the admin team is actually spending meaningful
time on repetitive WhatsApp replies, with real conversation logs to design against.

---

## 17. Pickup Partner Automation

NationWide's `PICKUP_PARTNER` role already has a dedicated web dashboard (built earlier this
engagement) — the question is whether WhatsApp adds value on top of that, not whether it replaces
it.

**Recommendation: App (the existing pickup partner dashboard) + WhatsApp for alerts, not
WhatsApp-only.** The dashboard is the system of record for a pickup partner's queue — better than
WhatsApp for anything requiring structured interaction (marking verification weight, entering
payment details, viewing multiple pickups at once). WhatsApp adds real value as a **push
notification channel** for partners who won't have the dashboard open at all times:

- **New pickup assigned**: `pickup_partner_assigned` template — customer name, address, date,
  time window, order weight (declared) — with a **URL button** deep-linking straight into that
  pickup's detail screen in the dashboard (`/partner/pickups/:id`), which already exists.
  A `Call customer` phone-number button is also viable if the customer's number is available at
  assignment time and the customer has consented to be contacted this way — check this against
  NationWide's own privacy stance before adding, since it exposes the customer's number to a
  third party (the pickup partner) via a channel outside the app.
- **Pickup completed confirmation**: a simple utility confirmation after the partner accepts the
  parcel in the app — reinforces the app action, doesn't replace it.

**Not recommended**: trying to do the actual weight-verification/payment-collection *input* via
WhatsApp (e.g. reply with the weight as a number) — this is exactly the kind of structured,
validated, audit-logged input the existing dashboard already does correctly (with the atomic
claim-then-act race-condition protection built earlier this engagement); rebuilding that
correctness via free-text WhatsApp parsing would be strictly worse and duplicative.

---

## 18. Tracking Notifications

**The core risk this section addresses**: carrier APIs (ICL and friends) emit many low-level
events — a naive "send WhatsApp on every carrier webhook" design spams the customer and burns
message budget on events nobody cares about ("arrived at sorting facility," "departed sorting
facility," "arrived at sorting facility #2"...).

**Current state**: `TrackingService.persistNewEvents()` already normalizes raw carrier events into
NationWide's own canonical `TrackingStatus` codes (`PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`,
`DELIVERED`, `EXCEPTION`) before anything downstream sees them — this normalization step is exactly
the right chokepoint to also decide notification-worthiness, and `templateForTrackingStatus()`
already maps each canonical status to a template name.

**Recommended notification policy** (a decision the current code doesn't yet encode — it should be
made explicit rather than "notify on every status change"):

| Canonical status | Notify? | Reasoning |
|---|---|---|
| `PICKED_UP` | **Yes, once** | High customer value — confirms the parcel actually left |
| `IN_TRANSIT` | **Selectively — first occurrence only, or a rate-limited digest, not every ping** | Carriers can emit many `IN_TRANSIT` events across a multi-leg journey (customs, hub transfers); repeating the same message per leg is exactly the spam this section warns against. Fire once on the *first* transition into `IN_TRANSIT`; suppress subsequent same-status events. |
| `OUT_FOR_DELIVERY` | **Yes, always** | High value, low frequency (happens once per shipment) |
| `DELIVERED` | **Yes, always** | The message customers most want |
| `EXCEPTION` | **Yes, always, immediately** | Customer needs to know regardless of frequency — a rare status, and always actionable |

**Implementation shape**: a same-status-as-last-time check before enqueueing — `Shipment.currentStatus`
already exists as "denormalized cache of latest canonical status" per its own schema comment; the
notification-trigger logic should compare the *new* canonical status against that cached value and
only enqueue when it's a genuine transition to a notify-worthy status, not merely a repeated event
carrying the same status. This is a small, targeted change to wherever `persistNewEvents()`
currently calls (or should call) `notificationsService.enqueue()` — not a new system.

---

## 19. Admin Dashboard

Phase 1 additions to the existing admin portal (not a new portal):

**WhatsApp Overview** (new card/page under Settings or a new "Communications" nav item):
- Messages sent / delivered / read / failed counts (derivable directly from the existing
  `Notification` table filtered to `channel = 'WHATSAPP'` — no new aggregation infrastructure
  needed)
- Opt-out count (from the new consent table/fields)

**Templates**: read-only view of the current template list and each one's Meta approval status
(fetched live from Meta's API or cached with periodic refresh) — **not** an in-app template
*editor* for Phase 1. Templates are code-defined (`templates.ts`) and submitted through Meta's/
360dialog's own tooling; building a redundant in-app editor is unnecessary scope until template
iteration frequency justifies it.

**Customer communication**: on the existing customer detail page, a new tab showing that
customer's WhatsApp message history (both `Notification` rows and `WhatsAppInboundMessage` rows,
merged and time-ordered) — this is the highest-value Phase 1 addition, since it's exactly where an
admin resolving a customer's WhatsApp reply (Section 16) needs to look. A basic "send a manual
message" action (free-form, only enabled while that customer's 24-hour window is open — disabled
otherwise, since a template would be required) rounds this out.

**Logs**: a filtered/paginated view of failed `Notification` rows (`status = 'FAILED'`), reusing
the pagination pattern already built into the admin Orders/Customers/Quotes list pages this
session — the same `X-Total-Count` header convention applies directly here.

**Automation config (enable/disable triggers)**: not recommended for Phase 1 — the trigger points
are business logic embedded in the services that own each state transition (Section 12), not a
generic rules engine. A per-event on/off toggle would need its own settings table and a check at
every one of those ~15 call sites; the actual operational need ("stop sending X kind of message")
is rare enough that a code change + deploy is an acceptable Phase 1 answer.

---

## 20. Security

**Current state and gaps**, mapped against what already exists:

| Requirement | Current state | Action needed |
|---|---|---|
| Access tokens never reach the frontend | ✅ Already true — all WhatsApp calls originate server-side in `NotificationsProcessor` | None |
| Secrets via environment variables | ✅ Pattern already established (`WHATSAPP_WEBHOOK_VERIFY_TOKEN` etc.) | Add `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` (or 360dialog's equivalent API key) the same way |
| Webhook signature verification | ❌ Missing (Section 14) | Implement `X-Hub-Signature-256` HMAC check before any inbound-message processing goes live |
| PII in logs | Existing `LoggingInterceptor` logs method/path/status/duration, not body — safe by construction | Ensure any new WhatsApp-specific logging (e.g. in the processor/webhook handler) never logs message body or phone numbers at `info` level; error-level logs should redact phone numbers to last 4 digits |
| Audit trail | `AuditLog` pattern already exists for admin actions | Extend to cover manual admin-sent WhatsApp messages (Section 19) — every manual send should write an `AuditLog` row the same way order-payment edits do |
| Role-based access | `RolesGuard`/`@Roles()` pattern already exists | Gate the new admin WhatsApp views behind `STAFF`/`ADMIN` the same way other admin routes are |
| Data retention | Not yet defined for `Notification`/message content generally | Policy decision, not engineering — flag to DPDP compliance owner (Section 15) |
| Encryption in transit | Cloud API is HTTPS-only by Meta's own requirement | None needed beyond what's already standard |
| Encryption at rest | Postgres, no field-level encryption currently on `Notification`/`Customer` content | Consistent with the rest of the platform's current posture — not a WhatsApp-specific gap to solve in isolation |

---

## 21. Reliability

| Failure | Handling |
|---|---|
| WhatsApp API down / Meta outage | BullMQ retry with exponential backoff (already configured, 3 attempts) handles transient outages; a sustained outage leaves messages `QUEUED`/retrying rather than lost — visible in the admin Logs view (Section 19) |
| Meta returns an error (4xx) | Non-retryable by nature (e.g. invalid template, invalid number) — the adapter should distinguish 4xx (mark `FAILED` immediately, don't burn retry attempts) from 5xx/timeout (let BullMQ's retry handle it) |
| Network timeout | Treated as retryable — same backoff path |
| Message rejected (policy violation) | Marked `FAILED` with the reason in `errorMessage`; surfaced in admin Logs |
| Template disabled/paused by Meta | Adapter call fails immediately with a clear error code — this should page/alert (Section 22) rather than silently retry, since retrying won't help and every affected customer stops receiving that message type until fixed |
| Phone number invalid | Marked `FAILED` immediately, no retry (retrying an invalid number wastes attempts and delays the real signal) |
| Customer blocked NationWide | Meta returns a specific error on send — treat as equivalent to opt-out: mark `whatsappOptOutAt` automatically so no further sends are attempted |
| Customer opted out | Checked before enqueue (Section 10) — never reaches the send path |
| Duplicate webhook delivery | Already idempotent for status updates (`updateMany` keyed on `providerMessageId`); same pattern required for inbound messages |
| Duplicate message send (our own bug/retry) | Idempotency key on the BullMQ job (Section 13) |
| Queue/Redis unavailable | `Notification` row still exists in Postgres (created before the enqueue call) even if the BullMQ add itself fails — visible as permanently `QUEUED` in admin Logs, a clear signal something needs manual re-triggering, rather than a silently lost message |
| Database unavailable | The rest of the platform is down too at that point — no WhatsApp-specific handling beyond what NationWide already needs for Postgres availability generally |

---

## 22. Monitoring

NationWide already plans Sentry + Better Stack/UptimeRobot — WhatsApp should plug into both rather
than get a separate monitoring stack:

- **Sentry**: capture adapter-level exceptions (Meta API errors, webhook signature failures) with
  the `Notification.id`/`providerMessageId` attached as context — same pattern as any other
  caught exception in the codebase, no new integration needed beyond instrumenting the new adapter
  code.
- **Better Stack/UptimeRobot**: add the existing `/api/v1/health` endpoint check (already built
  this session) as the baseline liveness signal; consider a synthetic check that the webhook `GET`
  verification handshake still responds correctly (cheap, catches a misconfigured verify token
  before Meta itself would notice via failed deliveries).
- **WhatsApp-specific metrics worth tracking** (derivable from existing/new tables, no new metrics
  infrastructure required for Phase 1): delivery rate (`delivered`/`sent` from `Notification`),
  read rate (`readAt` populated / `delivered`), failure rate and top failure reasons
  (`errorMessage` grouped), opt-out rate over time, template rejection/pause events (requires
  polling Meta's template-status API periodically or reacting to send-time errors — no live
  webhook for this today).
- **What to alert on**: a sustained rise in `FAILED` notifications (signals a token expiry, a
  paused template, or a Meta-side issue) is the single highest-value alert — wire it as a simple
  scheduled query (e.g. "FAILED count in the last hour > N") reported to Sentry or a lightweight
  cron-checked threshold, not a new monitoring platform.

---

## 23. Testing

| Scenario | How to test without touching real customers |
|---|---|
| Successful send | Unit test the adapter against a mocked HTTP client (same pattern as the existing `icl-shipping-provider.adapter.spec.ts`); integration-test against Meta's **test number** (Meta provides free test phone numbers for development that don't require business verification) |
| Failed send / invalid number | Mock the adapter to return Meta's documented error shapes; assert `Notification.status` ends `FAILED` with the right `errorMessage` |
| Opt-out | Send a `STOP` reply from a test WhatsApp number to the test number; assert `whatsappOptOutAt` is set and a subsequent `enqueue()` call for that customer is a no-op |
| Duplicate webhook | POST the same webhook payload twice in a test; assert only one `Notification`/`WhatsAppInboundMessage` state change results |
| Retry / exponential backoff | Existing BullMQ testing pattern — mock the adapter to fail N times then succeed, assert the job eventually completes and `attemptsMade` matches |
| API timeout | Mock the adapter's HTTP client to hang/reject; assert the job retries rather than immediately failing permanently |
| Template rejection | Cannot be simulated live (Meta's review is manual) — test the *code path* that handles a "template not approved" error response from the mocked adapter |
| Customer reply / manager handoff | End-to-end against Meta's test number: send a message from a real phone registered as a WhatsApp test recipient, verify it lands in `WhatsAppInboundMessage` and surfaces in the admin customer-communication tab |
| Order/pickup/tracking event triggers | Existing e2e test pattern (`*.e2e-spec.ts`) — assert the right `notificationsService.enqueue()` call happens with the right template/variables when each service method runs, exactly as the existing notification-trigger tests already do for other templates |
| Delivery/read status updates | POST synthetic webhook payloads matching Meta's documented status-callback shape directly at the test endpoint, bypassing Meta entirely |

**Avoiding accidental real-customer messages**: Meta's Cloud API sandbox/test mode restricts
sending to a small set of explicitly-registered test recipient numbers until the WABA is fully
live — use this deliberately during development (register only internal team phones as test
recipients), and keep the stub adapter (`StubWhatsAppAdapter`, already in the codebase) as the
default in the `test`/CI environment so unit and e2e test suites never make a real network call to
Meta at all — exactly how it already works today.

---

## 24. Implementation Roadmap

Each phase lists only what's *not* already done, given the current codebase state established
throughout this report.

**Phase 1 — WhatsApp infrastructure**
Tasks: create Meta Business Portfolio, choose and sign up with 360dialog, purchase dedicated
number (Section 7).
Dependencies: none.
Output: a WABA exists, not yet verified.
Testing: N/A (account setup).

**Phase 2 — Business verification**
Tasks: submit legal documents, complete domain verification, submit display name.
Dependencies: Phase 1.
Output: verified business, approved display name.
Production consideration: budget 3–10 business days; start this in parallel with Phase 3–5
engineering work, not sequentially after it.

**Phase 3 — API integration**
Tasks: implement `WhatsAppCloudApiAdapter implements MessagingProvider`, register it in
`MessagingAdapterRegistry` behind a feature flag/env check so it can coexist with the stub during
rollout, add the four new env vars (Section 20).
Dependencies: Phase 2 (need real credentials) — can be coded/unit-tested earlier against mocks.
Output: real send capability, still gated off in production.
Testing: unit tests mirroring the existing adapter-test pattern.

**Phase 4 — Webhook**
Tasks: add `X-Hub-Signature-256` verification, extend the webhook handler to branch on
`messages` vs `statuses` in the payload, wire the new branch to inbound handling (Phase 6).
Dependencies: Phase 2 (App Secret only exists once the app is created).
Output: secure, complete webhook.
Testing: Section 23's webhook scenarios.

**Phase 5 — Database**
Tasks: migration adding `WhatsAppInboundMessage`, `WhatsAppConsent` (or consent fields on
`Customer`).
Dependencies: none — can happen in parallel with Phase 3.
Output: schema ready for inbound + consent.

**Phase 6 — Notification service extensions**
Tasks: add the pre-send opt-out check to `NotificationsService.enqueue()`, add idempotency keys to
BullMQ jobs, add the same-status-suppression logic for tracking notifications (Section 18).
Dependencies: Phase 5.
Output: the existing queue is now opt-out-aware and spam-resistant.

**Phase 7 — Templates**
Tasks: finalize and submit the template list from Section 9 to Meta for approval.
Dependencies: Phase 2.
Output: approved templates, ready to send.
Production consideration: submit early — approval can take 24–48 hours and shouldn't block other
phases.

**Phase 8 — Order automation** / **Phase 9 — Pickup automation**
Tasks: mostly already wired (`enqueue()` calls already exist at the right state transitions per
Section 12) — the work here is verifying each existing call site now points at a real, approved
template name and flipping the adapter from stub to real.
Dependencies: Phases 3, 6, 7.
Output: real WhatsApp messages fire on real order/pickup events.
Testing: e2e tests already exist for the trigger logic — extend assertions to cover the real
adapter path in a staging environment against Meta's test number.

**Phase 10 — Tracking automation**
Tasks: implement the notify-worthiness policy from Section 18 (first-`IN_TRANSIT`-only,
always-notify for the other statuses) at the point `persistNewEvents()` currently would call
`enqueue()`.
Dependencies: Phase 6.
Output: no more "notify on every carrier ping."

**Phase 11 — Admin dashboard**
Tasks: build the Section 19 additions (Overview, customer-communication tab, failed-message log)
using the existing pagination/table components already built this session.
Dependencies: Phases 5, 6.
Output: admin visibility into WhatsApp activity.

**Phase 12 — Testing**
Tasks: the full Section 23 matrix, run against Meta's test number and internal test recipients.
Dependencies: all prior phases.
Output: confidence to flip the feature flag in production.

**Phase 13 — Production deployment**
Tasks: flip `MessagingAdapterRegistry` to the real adapter for a small pilot cohort first (e.g.
internal test orders only) before all customers, monitor Section 22's metrics closely for the
first week, then roll out fully.
Dependencies: all prior phases.
Output: live.

---

## 25. Production Deployment Checklist

- [ ] Meta Business Portfolio verified, legal name matches documents exactly
- [ ] Display name approved
- [ ] Dedicated phone number registered, not shared with any WhatsApp Business App usage
- [ ] 360dialog (or chosen BSP) account live, Embedded Signup completed, WABA confirmed owned by
      NationWide's own Meta Business Manager (not the BSP's)
- [ ] All Section 9 templates submitted and approved (not just created — check status is
      `APPROVED`, not `PENDING`)
- [ ] `WhatsAppCloudApiAdapter` passes the same unit/e2e test suite the stub currently passes
- [ ] Webhook signature verification live and tested against a deliberately-tampered payload
      (must reject with 403)
- [ ] Inbound message handling live, `STOP`/`UNSUBSCRIBE` path tested end-to-end
- [ ] WhatsApp-specific consent fields populated for existing customers (a migration/backfill
      decision — do not assume DPDP `consentGivenAt` implies WhatsApp opt-in retroactively;
      existing customers likely need a fresh, explicit opt-in prompt)
- [ ] Same-status-suppression logic live for tracking notifications (Section 18) — verified no
      duplicate `IN_TRANSIT` spam in a staging test against real carrier event sequences
- [ ] Admin dashboard additions live, gated behind `STAFF`/`ADMIN` roles
- [ ] Sentry capturing adapter/webhook exceptions with useful context
- [ ] Health-check/uptime monitoring includes the webhook endpoint
- [ ] Failed-message alerting threshold configured
- [ ] Rollout is staged (pilot cohort first), not a full flip on day one
- [ ] Rollback plan: `MessagingAdapterRegistry` reverting to `StubWhatsAppAdapter` is a one-line,
      already-tested fallback if the real integration misbehaves post-launch

---

## 26. Final Recommendation

Build WhatsApp as **one more adapter behind the interface that already exists** — the codebase's
own architecture already anticipated this correctly. Go through **360dialog** for zero-markup BSP
access with Embedded Signup (no lock-in), keep every customer-facing message in the **Utility**
category (cheap, easy to approve, matches what NationWide actually needs to send), and treat the
two real gaps — **webhook signature verification** and **inbound message handling** — as the
Phase 1 engineering work that actually matters, since almost everything else (queue, retry,
delivery tracking, event-triggered sends) is already production-shaped.

At 250 shipments/month this costs on the order of **$55–65/month all-in**, scales close to
linearly with volume, and adds essentially **zero new infrastructure** — Redis, Postgres, and
BullMQ are already running for the rest of the platform. The business risk that actually matters
is not technical: get the Meta Business Verification legal-name match right the first time, and
never let a promotional message slip into a Utility-approved template.

---

## Sources

- [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Meta — Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- [Meta — Official Business Accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/)
- [Meta — Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)
- [Meta — Get opt-in for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)
- [Meta — Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [360dialog — Pricing](https://360dialog.com/pricing)
- [Gupshup WhatsApp pricing India 2026 analysis](https://codingclave.com/blog/gupshup-whatsapp-pricing-india-2026)
- [AiSensy vs Interakt vs WATI 2026](https://aisensy.com/aisensy-vs-interakt-vs-wati)
- [Twilio WhatsApp markup analysis](https://setsmart.io/blog/whatsapp-business-api-pricing)
- [Respond.io — Phone Number Migration to WhatsApp Cloud API](https://respond.io/help/whatsapp/phone-number-migration-to-whatsapp-cloud-api)
- [Interakt — migrating from BSP](https://www.interakt.shop/resource-center/whatsapp-business-api-migrating-from-bsp/)
- [Sprout Social — WhatsApp 24-hour rule](https://support.sproutsocial.com/hc/en-us/articles/5343786902669-What-is-the-WhatsApp-24-hour-rule)
- [Sinch — Landline for WhatsApp Business](https://sinch.com/blog/whatsapp-business-using-landline/)
- [WhatsApp API Pricing India rate card summary](https://whautomate.com/whatsapp-business-api-pricing-india)

**Note on source reliability**: the official `developers.facebook.com` pages above are
authoritative. The India per-message rate figures and BSP pricing figures are drawn from
third-party analysis blogs (cited above) that aggregate Meta's published rate cards — Meta's
pricing has changed multiple times in the past 18 months, so **re-confirm exact current rates
against Meta's live rate card and 360dialog's live pricing page immediately before finalizing a
budget**, rather than treating this report's numbers as fixed.
