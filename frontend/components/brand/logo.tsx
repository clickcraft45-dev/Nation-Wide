import { cn } from "@/lib/utils/cn";
import { LOGO_MARK } from "@/lib/constants/assets";

/**
 * NationWide Logistics logo.
 *
 * THE MARK is the company's real artwork — the NW monogram with the globe and the aircraft —
 * served from public/assets/logo/ via LOGO_MARK. It replaced a drawn-in-code "Rise N" placeholder
 * that this file used to define as inline SVG paths.
 *
 * COLOUR. The supplied art is one flat ink on transparency, so the file carries SHAPE only and
 * the colour is applied in CSS: the PNG is used as a `mask-image` and the ink is whatever the
 * element's background-color is. That is what lets one asset render brand red on light surfaces,
 * white on the near-black panels, and plain black in print — no second file, and retoning the
 * mark is a token change rather than new artwork. It works *because* the art is single-ink; give
 * the mark a second colour and it needs real multi-colour artwork and an <img> again.
 *
 * Every screen renders the mark through this one component, so replacing or retoning it happens
 * here and nowhere else. app/favicon.ico and app/apple-icon.png are separate files
 * on disk because Next.js requires them there — keep them in sync with this artwork.
 */

export type LogoVariant =
  | "horizontal" // mark + "NationWide / LOGISTICS" side by side — navbars, sidebars
  | "icon" // mark only — compact spaces, app icon
  | "stacked" // mark above wordmark, centered — auth screens, splash
  | "compact" // mark + "NationWide" only, no subheading — tight mobile topbars
  | "mono" // single black ink — print, mono documents, anywhere colour is wrong
  | "reverse"; // single white ink — dark/near-black surfaces

export type LogoSize = "sm" | "md" | "lg";

/**
 * Ink of the mark. Defaults to the variant's own tone; pass it to retone any variant — `icon`
 * included — which the variant list alone could not express.
 *
 * `brand` is the identity colour, signal red, per the palette rule in globals.css: brand red is
 * for identity and never carries operational meaning. `mono` is the black ink for print and for
 * anywhere colour would read as a status. `reverse` is white for the near-black panels.
 */
export type LogoTone = "brand" | "mono" | "reverse";

// The mark is a mask, so its ink is a background colour. Wordmark ink is matched to it below.
const MARK_INK: Record<LogoTone, string> = {
  brand: "bg-brand-red",
  mono: "bg-foreground",
  reverse: "bg-white",
};

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


function NwMark({
  size,
  tone,
  className,
}: {
  size: number;
  tone: LogoTone;
  className?: string;
}) {
  return (
    // A masked <span>, not <img>: the art is one flat ink on transparency, so the file supplies
    // the silhouette and the colour comes from background-color — that is the whole reason one
    // asset can be red, white or black. The element is decorative-with-a-name rather than an
    // image, hence role/aria-label in place of alt.
    // ponytail: the PNG is the mask; the smaller AVIF is dropped because mask-image support for
    // AVIF is not universal. Swap in an SVG mask if the mark's weight ever matters.
    <span
      role="img"
      aria-label={LOGO_MARK.alt}
      className={cn("inline-block shrink-0", MARK_INK[tone], className)}
      style={{
        width: size,
        height: size,
        maskImage: `url(${LOGO_MARK.png})`,
        WebkitMaskImage: `url(${LOGO_MARK.png})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

export function Logo({
  variant = "horizontal",
  size = "md",
  tone: toneProp,
  showTagline = false,
  className,
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  /** Override the ink — `reverse` on a dark surface, `mono` where colour would be wrong. */
  tone?: LogoTone;
  /** Show the "Delivering trust worldwide" tagline — only meaningful on stacked/horizontal. */
  showTagline?: boolean;
  className?: string;
}) {
  const tone =
    toneProp ?? (variant === "reverse" ? "reverse" : variant === "mono" ? "mono" : "brand");
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
            // The eyebrow is the lockup's second voice, so it carries the brand red alongside the
            // mark and leaves "NationWide" as plain ink. On the near-black panels red at 10px
            // tracked out this far falls under contrast, so there it stays the panel's grey; in
            // `mono` it stays neutral by definition.
            onDark
              ? "text-sidebar-foreground"
              : tone === "brand"
                ? "text-brand-red"
                : "text-muted-foreground",
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
