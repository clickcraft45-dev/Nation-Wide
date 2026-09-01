import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

/**
 * THE BRAND KIT — the one page that shows what the identity actually is, rendered from the real
 * components and the real tokens rather than from screenshots. Every swatch below reads its own
 * CSS variable and every logo is the live <Logo>, so this page cannot drift from the product: if
 * someone retones --brand-red or reshapes the mark, this page changes with it. A brand sheet that
 * is a picture of the brand goes stale the first week.
 *
 * Sections are numbered so they can be cited in review ("see 04 Colour").
 */

export const metadata: Metadata = {
  title: "Brand Kit | NationWide Logistics",
  description:
    "Logo variants, colour, typography and downloadable assets for NationWide Logistics.",
  // Internal reference, not a page that should turn up in search results next to the product.
  robots: { index: false, follow: false },
};

/* ----------------------------- Layout primitives ---------------------------- */

function Section({
  index,
  title,
  blurb,
  children,
}: {
  index: string;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-24 border-t border-border pt-10" id={`s${index}`}>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="font-mono text-sm text-muted-foreground">{index}</span>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      {blurb && <p className="mb-6 max-w-2xl text-sm text-muted-foreground">{blurb}</p>}
      {children}
    </section>
  );
}

/** A labelled specimen tile. `dark` flips it onto the near-black panel treatment. */
function Tile({
  label,
  note,
  dark,
  className,
  children,
}: {
  label: string;
  note?: string;
  dark?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div
        className={cn(
          "flex min-h-32 items-center justify-center rounded-2xl border p-6",
          dark ? "border-sidebar-border bg-sidebar-bg" : "border-border bg-card",
          className,
        )}
      >
        {children}
      </div>
      <figcaption className="px-1">
        <span className="font-mono text-xs text-foreground">{label}</span>
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </figcaption>
    </figure>
  );
}

/* --------------------------------- 04 Colour -------------------------------- */

/** `token` is the CSS variable name; the chip paints itself with it, so it cannot misquote. */
function Swatch({
  token,
  name,
  usage,
  onDark,
}: {
  token: string;
  name: string;
  usage: string;
  onDark?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "h-20 rounded-xl border",
          onDark ? "border-white/15" : "border-border",
        )}
        style={{ backgroundColor: `var(${token})` }}
      />
      <div className="px-0.5">
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">{token}</p>
        <p className="mt-1 text-xs text-muted-foreground">{usage}</p>
      </div>
    </div>
  );
}

const BRAND_COLORS = [
  { token: "--brand-navy", name: "Navy / Ink", usage: "Brand panels, the logo badge, near-black surfaces." },
  { token: "--brand-blue", name: "Panel Raise", usage: "The lifted step above Navy inside a dark panel." },
  { token: "--brand-blue-bright", name: "Panel Accent", usage: "Light accent that reads ON the dark panels." },
  { token: "--brand-red", name: "Brand Red", usage: "Identity red. The arrowhead in the mark." },
  { token: "--brand-red-deep", name: "Red Deep", usage: "The red that survives on near-black glass." },
  { token: "--brand-red-bright", name: "Red Bright", usage: "Accent red for use on dark panels." },
  { token: "--brand-red-tint", name: "Red Tint", usage: "Wash for light surfaces." },
];

const SEMANTIC_COLORS = [
  { token: "--success", name: "Success", usage: "Delivered, paid, confirmed." },
  { token: "--warning", name: "Warning", usage: "Needs attention, pending review." },
  { token: "--danger", name: "Danger", usage: "Failure and destructive actions only." },
  { token: "--info", name: "Info", usage: "Neutral status and informational chips." },
];

/* ------------------------------- 06 Asset index ----------------------------- */

/**
 * Ordered by where a file is used, not alphabetically, because the order is the answer to
 * "which one do I need?". Paths are the real ones on disk — these are links, so a rename that
 * is not reflected here shows up as a 404 rather than as quietly stale documentation.
 */
const ASSETS = [
  {
    group: "Application icons",
    files: [
      { name: "icon.svg", path: "/icon.svg", use: "Primary favicon. Vector, scales to any size." },
      { name: "favicon.ico", path: "/favicon.ico", use: "Legacy fallback for older browsers." },
      { name: "apple-icon.png", path: "/apple-icon.png", use: "iOS home-screen icon, 180×180." },
    ],
  },
  {
    group: "Illustration",
    files: [
      { name: "world-map-dotted.svg", path: "/assets/images/world-map-dotted.svg", use: "Hero and coverage backdrop." },
      { name: "world-map-placeholder.svg", path: "/assets/images/world-map-placeholder.svg", use: "Flat fallback for the dotted map." },
    ],
  },
  {
    group: "Service cards",
    files: [
      { name: "service-express-placeholder.svg", path: "/assets/images/service-express-placeholder.svg", use: "Express delivery card." },
      { name: "service-international-placeholder.svg", path: "/assets/images/service-international-placeholder.svg", use: "International shipping card." },
      { name: "service-business-placeholder.svg", path: "/assets/images/service-business-placeholder.svg", use: "Business logistics card." },
      { name: "service-pickup-placeholder.svg", path: "/assets/images/service-pickup-placeholder.svg", use: "Doorstep pickup card." },
    ],
  },
  {
    group: "Typefaces",
    files: [
      { name: "NotoSans-Regular.ttf", path: null, use: "Invoice PDFs. Carries ₹ (U+20B9), which PDF base-14 fonts do not. Lives in apps/backend/assets/fonts/." },
      { name: "NotoSans-Bold.ttf", path: null, use: "Invoice PDF headings. Same directory." },
    ],
  },
];

/* ----------------------------------- Page ----------------------------------- */

export default function BrandKitPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="pb-10">
        <p className="font-mono text-sm text-muted-foreground">Brand Kit</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          NationWide Logistics
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Rendered from the live <code className="font-mono text-sm">Logo</code> component and
          the design tokens in <code className="font-mono text-sm">globals.css</code>. Change
          either and this page changes with it — nothing here is a screenshot.
        </p>
      </header>

      <div className="space-y-14">
        <Section
          index="01"
          title="The mark"
          blurb="One continuous stroke draws the N; an arrowhead crowns the right stem so the stem and head read as an upward arrow and as the letter at once. The red is carried by the one shape that is still a complete arrow without it, which is what lets the mark go single-ink with nothing lost."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label="horizontal" note="Default. Navbars and sidebars.">
              <Logo variant="horizontal" size="md" />
            </Tile>
            <Tile label="stacked" note="Auth screens, splash.">
              <Logo variant="stacked" size="md" />
            </Tile>
            <Tile label="compact" note="Tight mobile topbars.">
              <Logo variant="compact" size="md" />
            </Tile>
            <Tile label="icon" note="App icon, favicon, avatars.">
              <Logo variant="icon" size="lg" />
            </Tile>
            <Tile label="mono" note="Print, invoices, light surfaces.">
              <Logo variant="mono" size="md" />
            </Tile>
            <Tile label="reverse" dark note="Dark and near-black panels.">
              <Logo variant="reverse" size="md" />
            </Tile>
          </div>
        </Section>

        <Section
          index="02"
          title="Sizes and clear space"
          blurb="Three sizes only — sm 28px, md 36px, lg 48px. Keep clear space of at least the height of the mark's arrowhead on every side; the tinted band below shows that margin. The floor is 16px: the brief requires the mark to stay legible there, which is why the arrowhead is the only part carrying colour."
        >
          <div className="grid gap-6 sm:grid-cols-3">
            <Tile label="size=&quot;sm&quot;" note="28px mark">
              <Logo variant="horizontal" size="sm" />
            </Tile>
            <Tile label="size=&quot;md&quot;" note="36px mark">
              <Logo variant="horizontal" size="md" />
            </Tile>
            <Tile label="size=&quot;lg&quot;" note="48px mark">
              <Logo variant="horizontal" size="lg" />
            </Tile>
          </div>

          <div className="mt-6">
            <Tile label="clear space" note="Minimum margin on all four sides.">
              <div className="rounded-xl bg-brand-red-tint p-8">
                <Logo variant="icon" size="lg" />
              </div>
            </Tile>
          </div>
        </Section>

        <Section
          index="03"
          title="Misuse"
          blurb="The mark is one stroke weight and one geometry. These are the four failures that actually happen in practice."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="✗ stretched" note="Never scale non-uniformly.">
              <div className="scale-x-150">
                <Logo variant="icon" size="md" />
              </div>
            </Tile>
            <Tile label="✗ rotated" note="The arrow points up. Always.">
              <div className="rotate-45">
                <Logo variant="icon" size="md" />
              </div>
            </Tile>
            <Tile label="✗ recoloured" note="Only the tokens in 04.">
              <div className="[&_svg_*]:!stroke-emerald-500 [&_svg_rect]:!fill-emerald-100">
                <Logo variant="icon" size="md" />
              </div>
            </Tile>
            <Tile label="✗ low contrast" dark note="Use reverse on dark, not mono.">
              <Logo variant="mono" size="md" />
            </Tile>
          </div>
        </Section>

        <Section
          index="04"
          title="Colour"
          blurb="Brand red is for identity — the mark, brand accents, brand surfaces. It never carries operational meaning. If red on screen is telling the reader that something failed, it must be --danger, and the two must never appear in the same component."
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Brand
          </h3>
          <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {BRAND_COLORS.map((c) => (
              <Swatch key={c.token} {...c} />
            ))}
          </div>

          <h3 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Semantic
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SEMANTIC_COLORS.map((c) => (
              <Swatch key={c.token} {...c} />
            ))}
          </div>

          <h3 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Dark panel
          </h3>
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-bg p-6">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { token: "--sidebar-bg", name: "Panel", usage: "The panel ground itself." },
                { token: "--sidebar-accent", name: "Panel Row", usage: "Hover and active rows." },
                { token: "--sidebar-border", name: "Hairline", usage: "Dividers inside the panel." },
                { token: "--sidebar-foreground", name: "Panel Text", usage: "Idle labels." },
              ].map((c) => (
                <div key={c.token} className="flex flex-col gap-2">
                  <div
                    className="h-20 rounded-xl border border-white/15"
                    style={{ backgroundColor: `var(${c.token})` }}
                  />
                  <div className="px-0.5">
                    <p className="text-sm font-medium text-sidebar-foreground-active">{c.name}</p>
                    <p className="font-mono text-xs text-sidebar-foreground">{c.token}</p>
                    <p className="mt-1 text-xs text-sidebar-foreground">{c.usage}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section
          index="05"
          title="Typography"
          blurb="Poppins carries the brand voice. Geist Mono is not part of the type scale — it is a legibility choice, reserved for codes a human has to read back aloud or compare character by character: tracking numbers, AWBs, order and invoice ids."
        >
          <div className="space-y-6 rounded-2xl border border-border bg-card p-8">
            <div>
              <p className="mb-2 font-mono text-xs text-muted-foreground">
                Display · text-4xl / font-semibold / tracking-tight
              </p>
              <p className="text-4xl font-semibold tracking-tight">Delivering trust worldwide</p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-muted-foreground">
                Heading · text-2xl / font-semibold
              </p>
              <p className="text-2xl font-semibold tracking-tight">Shipments in transit</p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-muted-foreground">Body · text-base</p>
              <p className="max-w-2xl text-base">
                Every staff mutation is recorded in the audit log for compliance.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-muted-foreground">
                Caption · text-sm / text-muted-foreground
              </p>
              <p className="text-sm text-muted-foreground">Orders placed, last 90 days</p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-muted-foreground">
                Code · font-mono — identifiers only
              </p>
              <p className="font-mono text-base">NW-2026-0004182 · ₹12,480.00</p>
            </div>
          </div>
        </Section>

        <Section
          index="06"
          title="Assets"
          blurb="Grouped by where each file is used rather than alphabetically, because that is the question people actually arrive with. Every path is a live link — a rename that is not reflected here 404s instead of quietly going stale."
        >
          <div className="space-y-8">
            {ASSETS.map((group) => (
              <div key={group.group}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </h3>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {group.files.map((file) => (
                    <li
                      key={file.name}
                      className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
                    >
                      <div className="sm:w-80 sm:shrink-0">
                        {file.path ? (
                          <a
                            href={file.path}
                            className="font-mono text-sm underline underline-offset-4 hover:text-muted-foreground"
                          >
                            {file.name}
                          </a>
                        ) : (
                          <span className="font-mono text-sm">{file.name}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{file.use}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}
