---
name: frontend-design
description: Design-quality reference for any UI work in the NationWide frontend (apps/frontend) — typography, spacing, color tokens, layout, animation, and accessibility standards. Load before building or redesigning any page, component, or flow.
---

# Frontend Design Standard — NationWide

This is the design-quality bar for `apps/frontend`. It does not prescribe a look — it prescribes
discipline. Use it to judge your own work before calling a UI task done.

Stack in this repo: Next.js 16 (App Router) + React 19, Tailwind CSS v4 (tokens in
`app/globals.css` via `@theme inline`), Radix UI primitives, `class-variance-authority` for
variants, `lucide-react` for icons, `tailwind-merge`/`clsx` for class composition. Prefer these
over pulling in new UI libraries.

## 1. Typography hierarchy

- Every screen needs a clear type scale: one display/heading size, one section-heading size, one
  body size, one caption/meta size. Don't invent a new size for a one-off element — reuse the scale.
- Body text: `text-foreground` on primary content, `text-muted-foreground` for secondary/meta text.
  Never use pure gray hexes outside the token set.
- Headings carry hierarchy through size and weight, not color. Reserve `--color-primary` /
  `--color-brand-blue` accents for emphasis, links, and interactive elements — not for decorating
  headings.
- Tracking numbers, AWB codes, order IDs: always `font-mono` (`--font-mono`), never the sans body font.
  Consistency here matters — users scan for these codes.
- Line length: cap body copy at ~65-75ch on wide screens (`max-w-prose` or an explicit `max-w-*`).

## 2. Spacing system

- Use Tailwind's default spacing scale (4px base unit) exclusively — no arbitrary `px-[13px]`
  values unless matching a hard external constraint (e.g. an icon's intrinsic size).
- Pick one vertical rhythm per page/section and hold it: e.g. `gap-4` inside a card, `gap-6`
  between cards, `gap-12`/`gap-16` between major page sections. Don't mix arbitrary gaps within
  the same nesting level.
- Card/panel padding is consistent across the app: `p-6` for standard cards, `p-4` for compact/
  dense list rows. Check existing cards in the dashboard/admin views before introducing a new size.

## 3. Color tokens

- Never hardcode hex values in components. Every color must resolve to a token already defined in
  `app/globals.css` (`--background`, `--foreground`, `--card`, `--muted`, `--border`, `--primary`,
  `--success`/`--warning`/`--danger`/`--info` + their `-bg`/`-border` pairs, `--sidebar-*`,
  `--brand-*`).
- If a new semantic need arises (e.g. a new status color), add the token to `globals.css` and wire
  it through `@theme inline` — don't invent an ad hoc Tailwind color class inline.
- Status colors (`success`/`warning`/`danger`/`info`) always pair the `-bg`/`-border` variants
  together (soft background + matching border + solid text color) — this is the established badge/
  alert pattern across the app. Don't invent a different treatment for the same semantics.
- `--sidebar-bg` (Deep Navy) is reserved for brand panels: admin nav rail, marketing hero band,
  login split panel. Don't repurpose it as a generic dark surface elsewhere — the app is
  intentionally single-theme light, per the note in `globals.css`.
- Maintain WCAG AA contrast (4.5:1 body text, 3:1 large text/UI components) for every color pairing
  you introduce, especially white text on `--primary`/`--sidebar-bg`.

## 4. Layout & visual hierarchy

- Every page needs one unambiguous primary action and a clear reading order (F-pattern or Z-pattern
  for marketing; top-down task flow for dashboards). If two elements compete for attention, demote one.
- Use whitespace, not borders/dividers, as the first tool for separating sections. Reach for a
  `border` only when content density requires it (dense tables, list rows).
- Cards and panels use `--card` background with a subtle `--border`, never a heavier shadow-only
  or border-only look inconsistently across the same view.
- Group related controls; align related fields on a shared grid. Forms use a consistent label
  position and field width per section.

## 5. Responsive layouts

- Design mobile-first: base classes target the smallest viewport, then layer `sm:`/`md:`/`lg:`/`xl:`.
- Every interactive layout (dashboards, tables, multi-column forms) needs an explicit collapsed
  behavior below `md:` — don't let a grid silently overflow or truncate.
- Test at minimum: 375px (mobile), 768px (tablet), 1280px+ (desktop). Wide tables get horizontal
  scroll containers, never page-level horizontal scroll.
- Tap targets on mobile: minimum 44x44px for buttons/icon-buttons.

## 6. Component composition

- Compose from existing primitives (`components/` + Radix wrappers) before writing a new one from
  scratch. Check `apps/frontend/components` first.
- New variants go through `class-variance-authority` (`cva`), matching the pattern already used in
  the codebase — don't hand-roll conditional className strings for multi-state components.
- When adapting a component from 21st.dev or any external source: strip it down to only what's
  needed, re-point every color/spacing value to this repo's tokens, and match it to an existing
  primitive's API shape (props naming, variant naming) if one already exists for that component
  type. The result should be indistinguishable from a component written natively for this repo —
  never leave a foreign design system's fingerprints (its shadows, radii, font stack, spacing
  scale) in place.

## 7. Accessibility

- Every interactive element is reachable by keyboard and has a visible focus state (`--ring` token,
  already wired for standard inputs — don't suppress `:focus-visible`).
- All Radix primitives (`Dialog`, `DropdownMenu`, `Select`, `Tooltip`, `Avatar`) already handle
  focus trapping/ARIA — use them rather than rebuilding modal/menu/select behavior manually.
- Every `<img>`/icon-only button needs alt text or `aria-label`. Form fields need associated
  `<label>`s, not placeholder-only labeling.
- Respect `prefers-reduced-motion` for any non-essential animation — see the pattern already
  established in `globals.css` (`@media (prefers-reduced-motion: reduce)` disabling the marketing
  route animations).

## 8. Animation — Motion (Framer Motion)

Reference: https://motion.dev/

- Use Motion for React-driven animation (hero entrances, scroll reveals, staggered lists, modal/
  accordion transitions, page transitions). Use plain CSS keyframes (as already done in
  `globals.css` for the route-draw/route-travel marketing animation) for simple, non-interactive,
  always-running effects — don't pull in Motion for something CSS already does well.
- Default durations: micro-interactions (hover, tap, focus) 100-200ms; component transitions
  (accordion, dropdown, modal) 200-300ms; page/section entrances 300-500ms. Easing: `ease-out` for
  entrances, `ease-in-out` for state toggles.
- Stagger children in lists/grids with small deltas (30-60ms) — enough to read as intentional,
  never slow enough to make the user wait.
- Every animation must have a reason (draw attention to a state change, communicate spatial
  relationship, confirm an action succeeded). If you can't say why an element moves, cut the
  animation.
- Respect `prefers-reduced-motion` in every Motion component too — either via the `useReducedMotion`
  hook or by keeping transforms subtle enough (opacity/small translate) to degrade gracefully.
- Never block interaction on decorative animation. Loading states use skeletons or the existing
  spinner pattern, not a cute animation gating real content.

## 9. Avoiding generic "AI-generated" aesthetics

Red flags to actively avoid:
- Purple/blue gradient blobs, glassmorphism used indiscriminately, or a hero section that looks
  interchangeable with any SaaS landing page template.
- Overuse of large rounded-full badges, excessive drop shadows, or emoji-as-icons instead of
  `lucide-react`.
- Center-aligned everything, generic three-column "feature card" grids with no visual hierarchy
  between them.
- Animation on every single element on scroll — this reads as templated, not premium. Pick 2-3
  moments per page that deserve motion; let the rest be static.
- Restating the obvious in copy ("We provide fast, reliable shipping solutions"). Marketing copy
  should sound like NationWide's actual voice — direct, operational, logistics-industry credible —
  not generic startup copy.

The existing marketing homepage (`app/page.tsx`) and its route-drawing hero animation are the
current bar for "premium, original, on-brand" — match that level of intentionality, don't regress
below it.

## 10. Before calling UI work done

1. Check every color/spacing value traces back to a token or the standard Tailwind scale.
2. Resize the browser through mobile/tablet/desktop — no overflow, no broken tap targets.
3. Tab through the interactive elements — focus order and visibility both make sense.
4. If you added Motion animations, toggle `prefers-reduced-motion` (OS setting or DevTools
   rendering emulation) and confirm the page is still fully usable.
5. Step back and compare against the existing app — does this look like it was designed by the
   same team, or does it look bolted on?
