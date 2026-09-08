import { cn } from "@/lib/utils/cn";
import { LOGO_MARK } from "@/lib/constants/assets";

/**
 * NationWide Logistics logo.
 *
 * THE MARK is the company's real artwork — the NW monogram with the globe and the aircraft —
 * served from public/assets/logo/ via LOGO_MARK. It replaced a drawn-in-code "Rise N" placeholder
 * that this file used to define as inline SVG paths.
 *
 * COLOUR. The supplied art is one flat ink (black) on transparency, which is what makes `reverse`
 * work without a second file: on the dark sidebar and hero panels the mark is inverted to white
 * in CSS. That trick is only valid *because* the art is single-ink — if the logo ever gains a
 * second colour, invert would produce a wrong one and a real white asset has to be supplied here.
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


function NwMark({
  size,
  tone,
  className,
}: {
  size: number;
  tone: "brand" | "mono" | "reverse";
  className?: string;
}) {
  return (
    // <picture>, not next/image: the mark renders at four fixed sizes on every page including
    // the login split-panel and emails-adjacent print views, so there is nothing for the image
    // optimiser to decide and a plain element avoids a layout pass per logo.
    <picture>
      <source srcSet={LOGO_MARK.avif} type="image/avif" />
      <img
        src={LOGO_MARK.png}
        alt={LOGO_MARK.alt}
        width={size}
        height={size}
        // The art is black on transparency. On dark surfaces it would otherwise disappear, so it
        // is inverted to white — correct precisely because the mark is one flat ink.
        className={cn("object-contain", tone === "reverse" && "invert", className)}
        style={{ width: size, height: size }}
      />
    </picture>
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
