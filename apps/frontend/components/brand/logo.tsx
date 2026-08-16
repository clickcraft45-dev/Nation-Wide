import { cn } from "@/lib/utils/cn";

/**
 * NationWide Logistics logo.
 *
 * PLACEHOLDER MARK — no final logo files exist yet (confirmed with the brand owner). This is a
 * coded stand-in built from the brief's described elements (N monogram, globe/motion swoosh,
 * directional arrow) so every screen has a working, on-brand mark today. Swap the internals of
 * `NwMark` for the real asset when it's supplied — every call site already goes through this one
 * component, so nothing downstream needs to change.
 */

export type LogoVariant =
  | "horizontal" // mark + "NationWide / LOGISTICS" side by side — navbars, sidebars
  | "icon" // mark only — compact spaces, app icon
  | "stacked" // mark above wordmark, centered — auth screens, splash
  | "compact" // mark + "NationWide" only, no subheading — tight mobile topbars
  | "mono" // single dark ink, no background fill — print / light surfaces
  | "reverse"; // single white ink, no background fill — dark/navy surfaces

export type LogoSize = "sm" | "md" | "lg";

const ICON_PX: Record<LogoSize, number> = { sm: 28, md: 36, lg: 48 };
const WORDMARK_TEXT: Record<LogoSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};
const SUBHEADING_TEXT: Record<LogoSize, string> = {
  sm: "text-[8px]",
  md: "text-[9px]",
  lg: "text-[11px]",
};

function NwMark({
  size,
  tone,
  className,
}: {
  size: number;
  tone: "brand" | "mono" | "reverse";
  className?: string;
}) {
  // "brand": full-color badge (Logistics Blue) with a white glyph and a Bright Blue arrow accent.
  // "mono"/"reverse": outline-only glyph in a single ink color, no badge fill — for print and
  // dark surfaces respectively, per the brief's required logo variants.
  const flat = tone !== "brand";

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn(flat && (tone === "reverse" ? "text-white" : "text-foreground"), className)}
      role="img"
      aria-label="NationWide Logistics"
    >
      {!flat && <rect x="1" y="1" width="38" height="38" rx="10" className="fill-brand-blue" />}

      {/* Globe meridian / motion swoosh */}
      <path
        d="M7 27C13 16 27 13 34 18"
        fill="none"
        strokeWidth="2.25"
        strokeLinecap="round"
        className={flat ? "stroke-current opacity-40" : "stroke-white opacity-45"}
      />

      {/* N monogram, built from two verticals + a diagonal */}
      <g className={flat ? "fill-current" : "fill-white"}>
        <rect x="9" y="10" width="4.6" height="20" rx="1" />
        <rect x="26.4" y="10" width="4.6" height="20" rx="1" />
        <polygon points="13.6,10 19.6,10 26.4,30 20.4,30" />
      </g>

      {/* Directional arrow — upward/right movement, breaking past the mark's top-right edge */}
      <polygon
        points="28.5,9.5 36,2 36,9.5"
        className={flat ? "fill-current opacity-80" : "fill-brand-blue-bright"}
      />
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

  const wordmarkColor =
    tone === "reverse"
      ? "text-white"
      : tone === "mono"
        ? "text-foreground"
        : "text-foreground";
  const subheadingColor =
    tone === "reverse" ? "text-sidebar-foreground" : "text-muted-foreground";

  if (variant === "icon") {
    return <NwMark size={iconPx} tone={tone} className={className} />;
  }

  const wordmark = (
    <span className={cn("flex flex-col leading-none", variant === "stacked" && "items-center")}>
      <span className={cn("font-semibold tracking-tight", WORDMARK_TEXT[size], wordmarkColor)}>
        NationWide
      </span>
      {variant !== "compact" && (
        <span
          className={cn(
            "mt-0.5 font-semibold uppercase tracking-[0.22em]",
            SUBHEADING_TEXT[size],
            subheadingColor,
          )}
        >
          Logistics
        </span>
      )}
      {showTagline && (variant === "stacked" || size === "lg") && (
        <span
          className={cn(
            "mt-1.5 text-xs font-normal",
            tone === "reverse" ? "text-sidebar-foreground" : "text-muted-foreground",
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
