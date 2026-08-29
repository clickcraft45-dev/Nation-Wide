"use client";

import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

/**
 * Liquid-glass button — a refracting rim over a live backdrop.
 *
 * Adapted from the shadcn-style source rather than pasted verbatim, because this project isn't a
 * stock shadcn install: `cn` lives at @/lib/utils/cn, and there are no `--accent`, `--secondary`,
 * `--destructive` or `--input` tokens here, so those variants would have rendered as invisible
 * classes. The bundled `Button`/`buttonVariants` were dropped too — components/ui/button.tsx
 * already owns that role — and MetalButton with it, since nothing uses it.
 *
 * The distortion itself is `backdrop-filter: url(#…)` pointing at an SVG displacement map. Chrome
 * and Edge render it; Safari and Firefox ignore the URL filter and fall back to the shadow rim
 * plus a plain blur, which still reads as glass. Nothing breaks either way.
 */
const liquidButtonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium outline-none transition-[transform,color,box-shadow] duration-300 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Clear glass over a light surface — the tracking panel, the /track page.
        default: "text-foreground hover:scale-[1.03] active:scale-[0.99]",
        // Clear glass over the dark hero — same material, light ink.
        light: "text-white hover:scale-[1.03] active:scale-[0.99]",
        // Brand-tinted glass: keeps a primary CTA reading as the primary CTA.
        primary:
          "bg-primary/85 text-primary-foreground hover:bg-primary hover:scale-[1.03] active:scale-[0.99]",
      },
      size: {
        sm: "h-9 gap-1.5 px-4 text-xs",
        default: "h-11 px-6",
        lg: "h-12 px-8",
        xl: "h-14 px-10 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface LiquidButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof liquidButtonVariants> {
  asChild?: boolean;
  /** Renders a spinner and blocks input — matches the app Button's API. */
  isLoading?: boolean;
}

function LiquidButton({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  disabled,
  children,
  ...props
}: LiquidButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="liquid-button"
      className={cn(liquidButtonVariants({ variant, size }), className)}
      // `disabled` is meaningless on an <a>, and React warns about it there.
      disabled={asChild ? undefined : disabled || isLoading}
      {...props}
    >
      {/* Refracting rim: stacked inset shadows that read as a thick, wet glass edge. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(255,255,255,0.9),inset_-3px_-3px_0.5px_-3px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(255,255,255,0.15)] transition-all"
      />
      {/* The backdrop being bent. isolate + -z-10 keeps it behind the label. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 isolate -z-10 overflow-hidden rounded-[inherit] backdrop-blur-md"
        style={{ backdropFilter: 'url("#liquid-glass-distortion") blur(6px)' }}
      />
      {/* asChild hands the caller's element (an <a>, say) to Slot as the host. Slot needs exactly
          one host, so the label goes in a <Slottable> and the two decorative spans above are
          rendered inside that host as siblings of its own children. Without this, Slot throws
          "Slot failed to slot onto its children". */}
      {asChild ? (
        <Slottable>{children}</Slottable>
      ) : (
        <span className="pointer-events-none z-10 inline-flex items-center gap-2">
          {isLoading && (
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          {children}
        </span>
      )}
    </Comp>
  );
}

/**
 * The displacement map every LiquidButton points at. Mount ONCE per page (see app/layout.tsx) —
 * an SVG filter is global by id, so one definition serves every button, and repeating it per
 * button would just duplicate the same node.
 */
function LiquidGlassFilter() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter
          id="liquid-glass-distortion"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="1"
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale="70"
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

export { LiquidButton, LiquidGlassFilter, liquidButtonVariants };
