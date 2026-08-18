"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
}

// A cursor-tracked light source shared across every SpotlightCard on the page (each card is a
// window into the same field, clipped to its own rounded rect) — see the `[data-spotlight]`
// pseudo-element rules in globals.css for the actual glow rendering. Adapted from a 21st.dev-style
// "glow card" demo: the original exposed 5 hue presets (blue/purple/green/red/orange) with a wide
// hue spread that visibly rainbow-shifts as the pointer crosses the screen — dropped entirely,
// since a logistics site has one brand color, and per frontend-design SKILL.md, rainbow gradient
// glows read as a generic AI-demo effect, not a professional one. This version stays inside a
// narrow band of --brand-blue-bright regardless of pointer position, and is invisible until a
// mouse actually hovers a card, so it never changes the plain, high-contrast resting appearance
// the target audience (middle-aged/older customers) relies on to read these cards.
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fine-pointer only — touch devices get zero benefit from a hover glow, so skip the
    // listener entirely rather than pay its cost on every scroll-driving touchmove.
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const card = cardRef.current;
    if (!card) return;

    const syncPointer = (e: PointerEvent) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--spotlight-x", `${e.clientX - rect.left}`);
      card.style.setProperty("--spotlight-y", `${e.clientY - rect.top}`);
    };

    document.addEventListener("pointermove", syncPointer, { passive: true });
    return () => document.removeEventListener("pointermove", syncPointer);
  }, []);

  return (
    <div
      ref={cardRef}
      data-spotlight
      style={
        {
          "--spotlight-x": "-1000",
          "--spotlight-y": "-1000",
        } as CSSProperties
      }
      className={cn(
        // The cursor-tracked glow (globals.css [data-spotlight]) is a nice-to-have detail, but
        // it alone isn't a reliable "this is hoverable" signal — it's dim wherever the card's own
        // artwork is dark, and its visibility depends on exactly where the cursor lands. The
        // border/shadow shift here is the actual, always-visible confirmation that the card is
        // active, regardless of cursor position or what's underneath it.
        "relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}
