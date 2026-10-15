# NationWide Logistics platform

Indian cross-border courier and freight company. Customers get a price in minutes, book a door
pickup and track the parcel to 240+ countries; NationWide resells DHL, DHL Express, FedEx and UPS
so the customer deals with one company. Prices are in INR.

Five surfaces: public marketing site, customer portal (`app/(customer)`), B2B portal (`app/b2b`),
admin console (`app/admin`, dense tables) and the pickup partner's phone app (`app/partner`, used
one-handed outdoors in daylight).

## Stack and layout

npm workspaces monorepo, Node 20+.

- `frontend/`: Next.js 16 + React 19 + TypeScript, Tailwind v4, Radix, lucide, motion, recharts.
  Deployed to Cloudflare via OpenNext (`build:cf` / `deploy:cf`). **Read `frontend/AGENTS.md`
  first**: this Next.js has breaking changes, check `node_modules/next/dist/docs/` before writing code.
- `backend/`: NestJS modular monolith, feature modules in `backend/src/modules/*`. All routes under
  `/api/v1`. RBAC via `@Roles(...)` + `JwtAuthGuard`/`RolesGuard`.
- Database: PostgreSQL via Prisma (`backend/prisma`). Redis + BullMQ. S3 for PDFs and logos.
- `packages/shared-types`: compiled to `dist/`; rebuild it
  (`npm run build --workspace=packages/shared-types`) after any change there, or the apps see stale types.

## Commands

- `npm run dev`: backend on 4000, frontend on 3004 (fixed ports, see `scripts/ports.cjs`).
- `npm run build`, `npm run lint`, `npm run test` at the root run all workspaces.
- Frontend tests: vitest (`npm test --workspace=frontend`). Backend: jest (`*.spec.ts`).
- Migrations: `cd backend && npx prisma migrate deploy`; seed with `npm run db:seed`.
- Frontend deploy: `npm run build:cf` then `npm run deploy:cf` (in `frontend/`). `deploy:cf` boots
  the built Worker and refuses to deploy if `/`, `/login` or `/track` return 5xx, then checks the
  live site. `npm run check:cf` runs the local check alone.

## Next.js and OpenNext move together

`next` is pinned with `~` (patch updates only) because `@opennextjs/cloudflare` supports each
Next minor only after a release that patches for it. A caret range let a lockfile refresh pull in
Next 16.4 under OpenNext 1.20.6, and every page threw error 1101. Before bumping Next's minor
version, confirm `npm view @opennextjs/cloudflare peerDependencies` and its release notes cover it,
bump both together with `eslint-config-next`, and run `npm run build:cf && npm run check:cf`.

## Docs

`README.md` and `docs/` (API overview, deployment, env vars, admin and partner guides,
troubleshooting, security and production-readiness reports, UI audit PDF).

## Design language (already decided, extend it, don't fight it)

Source of truth: `frontend/app/globals.css` tokens and `docs/BRAND_BRIEF_PROMPT.md`.

- Black / white / oxblood. White surfaces, near-black ink (`#0b0b0c`), zinc neutrals, one deep
  oxblood brand red (`#7f1020`) for identity only. Brand red never signals an error and never
  sits in the same component as a danger state.
- Status colours are reserved for status: success `#15803d`, warning `#b45309`,
  danger `#b91c1c`, info `#27272a`. Never decorative.
- Retone through the CSS variables in `globals.css` only; keep variable names stable.
- Poppins for text, Geist Mono for tracking numbers, order IDs and AWB codes.
- Materials: frosted white glass on light surfaces, black glass for hero planet, CTA band, footer.

## Design skills

Installed as project skills in `.claude/skills/`. Read the relevant one before UI work.

| Skill | Use it for | Source |
|---|---|---|
| `taste-skill` (`design-taste-frontend`) | Building or redesigning marketing/landing pages without generic AI-template output | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) |
| `web-design-guidelines` | Reviewing any UI for accessibility, UX and performance; fetches Vercel's Web Interface Guidelines and reports `file:line` findings | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) |
| `awesome-design-md` | Borrowing structure from a real product's DESIGN.md (Stripe, Linear, Vercel...) or writing this project's own DESIGN.md | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) |

Rules that apply to every UI change, from those skills:

- Before building a page, state the design read in one line: page kind, audience, vibe, design
  system. For this project the audience is Indian senders and small businesses who need trust,
  so lean trust-first and calm, not experimental.
- Avoid the AI defaults: purple gradients, centered hero over dark mesh, three equal feature
  cards, glassmorphism on everything, endless micro-animations, Inter + slate. No em-dashes in UI copy,
  no fake data like "Jane Doe" or round placeholder numbers.
- Every interactive element needs hover, focus-visible, active, disabled and loading states.
  Respect `prefers-reduced-motion`. Animate only `transform` and `opacity`.
- Semantic HTML, labelled inputs, alt text, visible focus, touch targets of at least 44px
  (the partner app especially), no horizontal scroll on phones.
- The taste skill's three dials (`DESIGN_VARIANCE / MOTION_INTENSITY / VISUAL_DENSITY`, 1 to 10):
  marketing site about 5 / 4 / 3; admin console 3 / 2 / 8; partner app 2 / 2 / 5.
- Taste skill targets marketing pages. For the admin console and partner app, use
  `web-design-guidelines` and the existing components in `frontend/components/ui`.
- Another brand's DESIGN.md is reference only. Never import its colours, fonts or logo.
