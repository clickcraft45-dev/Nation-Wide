"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

const OFFSET = {
  left: "-translate-x-12",
  right: "translate-x-12",
  up: "translate-y-10",
  // Full-bleed sections with their own background colour translate badly — sliding one leaves a
  // strip of page background behind it. They fade instead.
  fade: "",
} as const;

// Scroll-triggered entrance for BELOW-the-fold content.
//
// Fails open by design: the server and the first client render are always visible, and the hidden
// start state is applied on the client only to elements that are still off-screen. A dead bundle,
// a hydration failure or a missing IntersectionObserver therefore leaves the content shown rather
// than blank. Above-the-fold content shouldn't use this at all — see the CSS `animate-slide-in-*`
// utilities, which need no JS.
export function Reveal({
  children,
  from = "up",
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  from?: keyof typeof OFFSET;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Already on screen — the visitor has seen it, so don't hide it just to animate it back in.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setHidden(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHidden(false);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: hidden ? "0ms" : `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out",
        "motion-reduce:translate-x-0 motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        hidden ? cn("opacity-0", OFFSET[from]) : "translate-x-0 translate-y-0 opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
