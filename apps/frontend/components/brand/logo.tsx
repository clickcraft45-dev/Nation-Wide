import { cn } from "@/lib/utils/cn";

/**
 * NationWide Logistics logo.
 *
 * THE MARK — "Rise N". One continuous stroke draws the N (stem, diagonal, stem), and an
 * arrowhead crowns the right stem so that stem-plus-head reads as an upward arrow and as the
 * letter at the same time. Two shapes, one stroke weight: the previous placeholder stacked three
 * separate ideas (monogram + globe swoosh + a detached arrow breaking the badge edge), which
 * turned to mud at favicon size.
 *
 * COLOUR. On the badge the arrowhead is brand red (--brand-red) — the black / white / red system.
 * The red is carried by the ONE shape that is still a complete arrow without it, so nothing is
 * lost when the mark has to be single-ink: the `mono` and `reverse` variants stay one flat ink by
 * contract (print, invoices, the black glass panels), and the favicon keeps the red because at
 * 16px the arrowhead is the only part with enough area to register as colour at all.
 *
 * Constraints it is built to (docs/BRAND_BRIEF_PROMPT.md): legible at 16px, recognisable in a
 * single flat ink, no gradient and no baked-in shadow, and readable embossed on black glass.
 *
 * Every screen renders the mark through this one component, so retoning or replacing it happens
 * here and nowhere else. `app/icon.svg` and `app/apple-icon.png` carry the same geometry as
 * static files, because Next.js needs those on disk — keep the three in sync.
 */

export type LogoVariant =
  | "horizontal" // mark + "NationWide / LOGISTICS" side by side — navbars, sidebars
  | "icon" // mark only — compact spaces, app icon
  | "stacked" // mark above wordmark, centered — auth screens, splash
  | "compact" // mark + "NationWide" only, no subheading — tight mobile topbars
  | "mono" // single dark ink, no background fill — print / light surfaces
  | "reverse"; // single white ink, no background fill — dark/near-black surfaces

export type LogoSize = "sm" | "md" | "lg";

const ICON_PX: Record<LogoSize, number> = { sm: 28, md: 36, lg: 48 };
const WORDMARK_TEXT: Record<LogoSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};
// Floor of 9px: the eyebrow is uppercase and tracked out 0.22em, and below 9px that combination
// stops being letters and becomes texture.
const SUBHEADING_TEXT: Record<LogoSize, string> = {
  sm: "text-[9px]",
  md: "text-[10px]",
  lg: "text-[11px]",
};

/** The N, drawn in one unbroken stroke: up the left stem, down the diagonal, up the right stem. */
const N_PATH = "M10.5 30V14L25.5 30V10";
/** The arrowhead, apex landing on the right stem's top cap so stem and head fuse into one arrow. */
const ARROW_PATH = "M21.9 13.6L25.5 10L29.1 13.6";

function NwMark({
  size,
  tone,
  className,
}: {
  size: number;
  tone: "brand" | "mono" | "reverse";
  className?: string;
}) {
  // "brand": near-black rounded-square badge carrying a white glyph.
  // "mono"/"reverse": the bare glyph in a single ink, no badge — for print and for the dark
  // panels respectively, per the brief's required variants.
  const badge = tone === "brand";

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn(!badge && (tone === "reverse" ? "text-white" : "text-foreground"), className)}
      role="img"
      aria-label="NationWide Logistics"
    >
      {badge && <rect x="1" y="1" width="38" height="38" rx="10" className="fill-brand-navy" />}
      <g fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={N_PATH} className={badge ? "stroke-white" : "stroke-current"} />
        <path
          d={ARROW_PATH}
          className={badge ? "stroke-brand-red-bright" : "stroke-current"}
        />
      </g>
    </svg>
  );
}

export function Logo({
  variant = "horizontal",
  size = "md",
  showTagline = false,
  className,
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  /** Show the "Delivering trust worldwide" tagline — only meaningful on stacked/horizontal. */
  showTagline?: boolean;
  className?: string;
}) {
  const tone = variant === "reverse" ? "reverse" : variant === "mono" ? "mono" : "brand";
  const iconPx = ICON_PX[size];
  const onDark = tone === "reverse";

  if (variant === "icon") {
    return <NwMark size={iconPx} tone={tone} className={className} />;
  }

  const wordmark = (
    <span className={cn("flex flex-col leading-none", variant === "stacked" && "items-center")}>
      <span
        className={cn(
          "font-semibold tracking-tight",
          WORDMARK_TEXT[size],
          onDark ? "text-white" : "text-foreground",
        )}
      >
        NationWide
      </span>
      {variant !== "compact" && (
        <span
          className={cn(
            "mt-0.5 font-semibold uppercase tracking-[0.22em]",
            SUBHEADING_TEXT[size],
            onDark ? "text-sidebar-foreground" : "text-muted-foreground",
          )}
        >
          Logistics
        </span>
      )}
      {showTagline && (variant === "stacked" || size === "lg") && (
        <span
          className={cn(
            "mt-1.5 text-xs font-normal",
            onDark ? "text-sidebar-foreground" : "text-muted-foreground",
          )}
        >
          Delivering trust worldwide
        </span>
      )}
    </span>
  );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5",
        variant === "stacked" && "flex-col text-center",
        className,
      )}
    >
      <NwMark size={iconPx} tone={tone} />
      {wordmark}
    </span>
  );
}
