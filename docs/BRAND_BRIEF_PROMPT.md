# Brand prompts for NationWide Logistics

Three prompts to hand to Claude or Gemini. **Prompt A** is the main one (full identity system,
text-and-SVG output). **Prompt B** is for image models when you want to look at logo directions.
**Prompt C** is a short one if you only want the type decision.

Everything in these prompts matches what the app already ships — the palette tokens in
`frontend/app/globals.css`, the placeholder mark in `components/brand/logo.tsx`, and the
Poppins / Geist Mono pairing in `app/layout.tsx` — so whatever comes back can be dropped straight
in.

---

## Prompt A — full identity system

```
You are a brand identity designer. Design a complete identity system for NationWide Logistics.
Deliver it as text and inline SVG I can paste into code — no image files, no mood-board talk.

THE COMPANY
NationWide Logistics is an Indian cross-border courier and freight company. Customers (retail
senders and small businesses, mostly in Indian metros) get a price in minutes, book a door
pickup, and track the parcel to 240+ destination countries. Behind the scenes the company
resells and coordinates the big carrier networks — DHL, DHL Express, FedEx, UPS — so the
customer deals with one company instead of four. Prices are in INR. The tagline in use is
"Delivering trust worldwide"; the hero line is "Your Shipments. Our Network. Delivered
Worldwide."

There are three separate interfaces the identity has to survive in:
1. A public marketing site (white, glassmorphic, one enormous black-glass globe rising out of
   the bottom of the hero).
2. An admin console — dense tables of orders, quotes, shipments, rate cards, audit logs.
3. A pickup partner's phone app, used one-handed, outdoors, in Indian daylight.

THE DESIGN LANGUAGE ALREADY IN PLACE (do not fight it — extend it)
- BLACK / WHITE / RED. White surfaces, near-black ink, zinc neutrals between, and one deep red
  as the single chromatic brand voice — the trust-and-authority register, not a decorative
  palette. The existing tokens:
    background #ffffff   foreground #0b0b0c   primary #18181b   primary-hover #000000
    muted #f4f4f5        muted-foreground #6b6b72   border #e4e4e7
    dark panel / brand black #0b0b0c   panel accent #1c1c1f   panel border #27272a
    brand-red #7f1020 (dark base)   brand-red-deep #5a0a17   brand-red-bright #c8384a
    brand-red-tint #fbeef0
  The red is a deliberate OXBLOOD, not a bright alarm red, because the app already owns a bright
  red for failure (danger #b91c1c below) and the two must never be confused. Brand red carries
  identity only — the mark's arrowhead, brand accents, brand surfaces. It never means "something
  went wrong", and it must not appear in the same component as a danger state. Everything else
  stays monochrome; red is an accent, not a fourth surface colour.
- Status colour is RESERVED and is the one non-monochrome exception, because delivered / failed /
  pending carry operational meaning that must survive a colour-blind or hurried reader:
    success #15803d   warning #b45309   danger #b91c1c   info #27272a
  Never repurpose these as brand or decorative colours.
- Material language: frosted white glass panels on the light surface, black glass as the
  secondary material (the hero planet, the closing CTA band, the footer).
- Typography today: Poppins for everything, Geist Mono reserved for tracking numbers, order IDs
  and AWB codes — codes must be unmistakably monospaced and unambiguous (0/O, 1/l/I, 5/S, 8/B).

WHAT I NEED BACK

1. LOGO SYSTEM. A monogram/mark plus a wordmark. Give me the reasoning in two sentences, then
   the actual geometry as inline SVG on a 40x40 viewBox for the mark and a separate SVG for the
   lockup. It must work as:
     - horizontal  (mark + "NationWide" over a small "LOGISTICS" eyebrow) — navbars, sidebars
     - icon        (mark alone) — favicon, app icon, 16px
     - stacked     (mark above wordmark, centred) — login screen, splash
     - compact     (mark + "NationWide", no eyebrow) — narrow mobile top bars
     - mono        (single dark ink, no fill) — print, invoices, rate-card PDFs
     - reverse     (single white ink, no fill) — the black glass panels
   Constraints: legible at 16px; recognisable in one flat ink; no gradient, no photographic
   effect, no drop shadow baked into the mark; readable when embossed on black glass. Currently
   there is only a placeholder mark — an N monogram with a globe meridian and a directional
   arrow. Treat that as an idea to beat, not a constraint to keep.

2. THREE DISTINCT DIRECTIONS for that mark before you commit — one sentence each on the idea,
   then pick one and justify it in two sentences. I want to see the alternatives you rejected.

3. COLOUR. Confirm or revise the tokens above as a named scale (give every step a hex and a
   role). The black/white/red decision is settled — what I want from you is the red scale done
   properly: how many steps it needs, which step is the base, and exactly which surfaces each
   step is allowed on. It must stay unmistakable against danger #b91c1c at a glance and for a
   red-green colour-blind reader, and it must survive on both white and #0b0b0c glass. Include
   contrast ratios against both #ffffff and #0b0b0c, and flag anything under 4.5:1 for text or
   3:1 for UI. If you think the red is a mistake, say so once, with the argument — then give me
   the best version of it anyway.

4. TYPOGRAPHY. A display/UI face and a monospace face for codes. Poppins and Geist Mono are in
   use — either defend keeping them or name a better pair, with the trade-off stated. Both must
   be free, self-hostable, available on Google Fonts, and carry Devanagari or at least an
   obvious sibling for Hindi later. Then give me:
     - the weights I actually need (no more than three)
     - a type scale in rem for: display, h1, h2, h3, body, small, caption, code
     - line-height and tracking per step
     - the one rule for when the mono face is used instead of the UI face

5. THE MARK IN MOTION. One sentence on how the logo behaves as a loading state — the app already
   animates a dotted globe, and a rotating or drawing mark would need to feel like the same
   object.

6. USAGE RULES, six bullets maximum: minimum size, clear space (expressed in units of the mark),
   what may sit behind it, what must never happen to it, favicon guidance, and the one lockup to
   use when a partner carrier's logo appears next to ours.

7. HANDOFF. Finish with a copy-pasteable block of CSS custom properties for the whole palette
   and type scale, in the same naming style as the tokens I listed above.

Ask me anything that would change the answer before you start. Otherwise begin — and be
opinionated: I want a designer's decisions, not a menu of options.
```

---

## Prompt B — logo exploration for an image model

Use with Gemini's image generation or any image model. Run it three or four times and keep what
survives; then feed the winner back into Prompt A as the mark to redraw as SVG.

```
A minimal vector logo mark for a cross-border logistics company called NationWide.
Flat and two-tone: pure black on pure white, with at most ONE element picked out in a deep
oxblood red (#7f1020). No gradient, no shadow, no 3D, no photorealism.
Geometric monogram built from the letter N, with a single implied line of forward motion —
a meridian, a flight arc, or a folded route line. Balanced in a square, works at 16 pixels,
one continuous idea rather than several stacked symbols.
Style: Swiss/International typographic, thick confident strokes, generous negative space,
the restraint of a shipping stencil.
Present it centred on a plain white background with nothing else in frame.
No text, no wordmark, no tagline, no mockup, no packaging, no globe made of dots.
```

Variations worth trying: swap `the letter N` for `the letters N and W interlocked`; swap the
motion line for `a customs stamp corner mark`; ask for `a mark cut out of a solid black square`
for the reverse/black-glass case.

---

## Prompt C — typography only

```
Pick a typeface pairing for an Indian cross-border logistics platform: a UI/display face and a
monospace face for tracking numbers and AWB codes. Both must be free, self-hostable and on
Google Fonts, with a Devanagari companion available for a future Hindi version.

The UI face is used across a white glassmorphic marketing site, a dense admin console full of
tables, and a phone app used outdoors in daylight. The mono face appears only inside codes, so
its digits must be unmistakable: 0 vs O, 1 vs l vs I, 5 vs S, 8 vs B.

We currently use Poppins and Geist Mono. Either defend that pair or replace it, in both cases
saying what the trade-off is. Then give me three weights maximum, a rem type scale for display /
h1 / h2 / h3 / body / small / caption / code with line-height and tracking, and one sentence on
when the mono face is used instead of the UI face. Be decisive.
```

---

## After you get the answers

- The mark drops into `frontend/components/brand/logo.tsx` — every screen already goes
  through that one component, so replacing the internals of `NwMark` swaps the logo everywhere.
- Palette tokens live in `:root` in `frontend/app/globals.css`; keep the variable NAMES and
  change only the values, or every component that consumes them has to be touched. The red scale
  is `--brand-red*` there, next to `--brand-navy` — and note the rule in the comment above it:
  brand red is identity, `--danger` is failure, and they are not interchangeable.
- `app/icon.svg` carries the same geometry AND the same red as the mark, with the hex inlined
  (a static file cannot read CSS variables) — change one and change the other.
- Fonts are loaded in `frontend/app/layout.tsx` via `next/font/google`.
