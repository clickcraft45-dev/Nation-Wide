# Gupshup WhatsApp Setup — Step-by-Step

Chosen provider: **Gupshup** (see [WHATSAPP_INTEGRATION_STRATEGY.md](WHATSAPP_INTEGRATION_STRATEGY.md)
for why — cheapest at NationWide's current volume, ~$4–5/month in platform markup vs. 360dialog's
flat €49/month, with the same WABA-ownership guarantee).

This is the account-setup checklist. It ends where the engineering work begins (Section 7) —
implementing `WhatsAppCloudApiAdapter` against the credentials this process produces.

---

## Before you start — have these ready

- [ ] NationWide's legal business name **exactly as it appears** on your registration documents
      (GST certificate / certificate of incorporation) — the #1 cause of delay is a mismatch here
- [ ] Those documents themselves, scanned/photographed
- [ ] Business address, business website URL, a business email on the same domain as the website
- [ ] A **dedicated mobile number**, not currently on WhatsApp (personal or Business App) and not
      used anywhere else in NationWide's operations — buy a fresh SIM for this if needed. It only
      needs to receive one SMS or voice call during verification.
- [ ] Someone with authority to complete business verification on Meta's behalf (this becomes an
      admin on the Meta Business Portfolio)

---

## Step 1 — Meta Business Portfolio + Business Verification

Do this first — it gates everything else, and takes the longest (2–4 days once documents are
correct).

1. Go to [business.facebook.com](https://business.facebook.com) and create a Business Portfolio
   for NationWide Logistics, if one doesn't already exist.
2. Inside the portfolio, start **Business Verification**: enter the legal business name, address,
   website, and business email.
3. Upload the company documents (GST registration / certificate of incorporation).
4. Complete **domain verification** for the business email's domain — either add a DNS TXT record
   or upload a verification file to the website, whichever Meta's flow offers.
5. Submit and wait for review. You'll get an email when it clears (or if something needs
   correcting — a name mismatch is the most common reason it bounces back).

**Output**: a verified Meta Business Portfolio.

---

## Step 2 — Create a Gupshup account

1. Go to Gupshup's WhatsApp Self-Serve page and sign up (email, or Google/Facebook/GitHub).
2. Verify your email via the OTP Gupshup sends.
3. Log in to the Gupshup dashboard.

**Output**: a Gupshup account, not yet connected to any WABA.

---

## Step 3 — Create your first Gupshup app

1. In the Gupshup dashboard, go to **Dashboard → WhatsApp**.
2. Select **Create your first app**.
3. Name it something internal/identifiable — e.g. `nationwide-logistics-prod`. Minimum 6
   characters, no spaces or special characters. This name is only for your own reference inside
   Gupshup, it's not customer-facing.

**Output**: an empty Gupshup app, ready to attach a real WhatsApp number to.

---

## Step 4 — Embedded Signup (connects your dedicated number, creates the WABA)

This is the step that actually registers NationWide's WhatsApp number and creates the WABA —
**inside NationWide's own verified Meta Business Portfolio from Step 1**, not Gupshup's. That's
what keeps you owning the number/WABA regardless of which BSP you use later.

1. From the app you just created, start the **Embedded Signup** flow (Gupshup's dashboard walks
   you into Meta's own signup UI here).
2. Log in with the Meta account tied to NationWide's Business Portfolio when prompted.
3. Enter the dedicated phone number from your prep checklist.
4. Choose SMS or voice call for the one-time verification code, enter it when received.
5. Confirm the details and complete the flow.

**Output**: a live WABA, owned by NationWide's Meta Business Portfolio, with the dedicated number
registered and connected to your Gupshup app.

---

## Step 5 — Submit the display name

1. In Meta's business settings (reachable from the Embedded Signup flow or directly in Business
   Manager), submit the **display name** — e.g. `NationWide Logistics`.
2. This is reviewed separately from business verification, usually resolves same-day once the
   business itself is verified.

**Output**: an approved display name — this is what customers see in the chat header next to the
verified checkmark.

---

## Step 6 — Create and submit templates

Do this **before** any code goes live — approval takes 24–48 hours per template, so start it in
parallel with engineering, not after.

1. In Gupshup: **Dashboard → WhatsApp → your app → Templates tab**.
2. For each template in the recommended list (see
   [WHATSAPP_INTEGRATION_STRATEGY.md Section 9](WHATSAPP_INTEGRATION_STRATEGY.md#9--template-strategy)
   — `pickup_request_received`, `pickup_partner_assigned`, `pickup_reminder`,
   `pickup_verification_complete`, `payment_collected`, `order_confirmation`,
   `pickup_confirmation`, `in_transit_update`, `out_for_delivery`, `delivered`,
   `delivery_exception`, `quote_ready`, `quote_rejected`, `pickup_request_needed`,
   `pickup_rejected`):
   - Enter the template name exactly as it appears in `backend/src/modules/notifications/templates.ts`
   - Select category: **Utility** for all of these (none are Marketing — see the strategy doc's
     categorization table if you want to double-check any individual one)
   - Write the body text with `{{1}}`, `{{2}}` variable placeholders where needed, and provide
     **realistic sample values** for each variable (mandatory — Gupshup/Meta reject templates with
     placeholder-looking or missing samples)
   - Submit
3. Repeat for each template. They can all be submitted the same day; approvals trickle in over the
   next 1–2 days.
4. Once approved, click **Sync** on the Templates tab so Gupshup's record matches what Meta
   actually approved.

**Output**: an approved template list, ready to be called from the backend.

---

## Step 7 — Get the credentials the backend needs

1. In the Gupshup dashboard, open your app, go to **Settings**.
2. Note down:
   - **API key** (under the Settings tab, or in the request code-snippet section)
   - **App ID**
   - **Source number** (the WhatsApp-registered number itself, in the format Gupshup's API
     expects — shown in Settings)
3. These map directly to new environment variables on the backend, following the existing pattern
   in `backend/.env.example`:

   ```
   WHATSAPP_PROVIDER=GUPSHUP
   GUPSHUP_API_KEY=<from Settings>
   GUPSHUP_APP_ID=<from Settings>
   GUPSHUP_SOURCE_NUMBER=<from Settings>
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=<already exists — a value you choose, shared with the webhook config below>
   ```

---

## Step 8 — Configure the webhook

1. In Gupshup's dashboard, find the webhook/callback URL setting for your app (under app Settings
   or a dedicated Webhooks section).
2. Point it at NationWide's existing endpoint: `https://<your-production-domain>/api/v1/webhooks/whatsapp`
   — this route already exists (`WhatsAppWebhookController`), it just needs Gupshup's payload
   shape handled (Gupshup's webhook format differs slightly from raw Meta Cloud API — this is
   engineering work, see Step 9).
3. The endpoint must be publicly reachable over HTTPS — it won't work against `localhost` until
   deployed, or tunneled (e.g. ngrok) for testing.

**Output**: Gupshup delivering delivery-status and inbound-message events to NationWide's backend.

---

## Step 9 — Engineering work (not account setup — flagging what's next)

Everything above produces credentials and approved templates; nothing sends a real message yet.
What's left is code, tracked separately:

- Implement `WhatsAppCloudApiAdapter implements MessagingProvider` (replacing
  `StubWhatsAppAdapter`) calling Gupshup's send API with the credentials from Step 7
- Register it in `MessagingAdapterRegistry`
- Add `X-Hub-Signature-256`-equivalent verification for Gupshup's webhook (confirm Gupshup's exact
  signature scheme in their webhook docs — it may differ from raw Meta's header name)
- Extend `WhatsAppWebhookController` to parse Gupshup's payload shape (status callbacks *and*
  inbound messages — the current code only reads status callbacks)
- Add the WhatsApp-specific consent fields (Section 10/15 of the strategy doc)

This is the Phase 3–7 work already scoped in [WHATSAPP_INTEGRATION_STRATEGY.md Section 24](WHATSAPP_INTEGRATION_STRATEGY.md#24--implementation-roadmap).
Say the word when Step 1–8 credentials are in hand and I'll start on this.

---

## Cost recap

| | Monthly |
|---|---|
| Gupshup platform fee (self-serve tier) | $0 |
| Gupshup markup (~$0.001/message × ~1,750 utility messages/month) | ~$1.75 |
| Meta's own message cost (India utility rate) | ~$2.45 |
| **Total** | **~$4–5/month** |

No setup fee from Gupshup or Meta. The only one-time cost is the SIM/number itself.

---

## Sources

- [Gupshup — Onboarding Guide](https://docs.gupshup.io/docs/onboarding-guide)
- [Gupshup — Create Your First App](https://docs.gupshup.io/docs/quickstart-create-and-configure-access-api)
- [Gupshup — Create Template](https://docs.gupshup.io/docs/create-template)
- [Gupshup — Migration/Embedded Signup Flow](https://support.gupshup.io/hc/en-us/articles/28569499731737-Migration-from-other-BSP-to-Gupshup-via-Embedded-Signup-Flow)
- [Meta — Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)

**Note**: Gupshup's docs mention Embedded Signup v2 is being deprecated October 15, 2026 in favor
of v4 — if you're doing this setup close to or after that date, confirm you're being routed
through v4 (should be automatic from the dashboard by then, but worth a glance).
