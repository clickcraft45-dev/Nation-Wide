"use client";

import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { TrackingLookupPanel } from "@/features/tracking/TrackingLookupPanel";
import { HeroGlobe } from "@/components/marketing/hero-globe";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const, delay: i * 0.08 },
  }),
};

// Mobile-first, and mobile IS the primary surface here — most traffic is on phones, so this is
// one centered composition (badge, headline, supporting line, tracking, CTA, all center-aligned
// and vertically centered on the globe) that scales up with breakpoints rather than switching
// layout strategy at md+. The globe is always full-bleed-centered behind the text; only its size
// changes per breakpoint. A radial vignette (not a side gradient) darkens the globe's center so
// the text sitting directly on top of it stays readable without hiding the globe elsewhere.
export function MarketingHero() {
  const gate = useAuthGate();
  const prefersReducedMotion = useReducedMotion();

  const initial = prefersReducedMotion ? "show" : "hidden";

  return (
    <section id="track" className="relative overflow-hidden bg-sidebar-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[150vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 sm:w-[120vw] sm:max-w-[680px] md:w-[92vmin] md:max-w-[820px] lg:max-w-[900px]"
      >
        <div className="pointer-events-auto h-full w-full">
          <HeroGlobe />
        </div>
      </div>

      {/* Radial vignette centered on the globe (and the text sitting on top of it) — keeps the
          headline/form readable without a hard-edged box around either. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_50%,var(--sidebar-bg)_0%,color-mix(in_srgb,var(--sidebar-bg)_65%,transparent)_45%,transparent_72%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-[560px] max-w-2xl flex-col items-center justify-center gap-5 px-6 py-16 text-center sm:min-h-[640px] sm:gap-6 sm:py-20 md:min-h-[720px] md:py-24 lg:min-h-[780px] lg:py-28">
        <motion.p
          initial={initial}
          animate="show"
          custom={0}
          variants={fadeUp}
          className="inline-flex items-center rounded-full border border-primary/40 bg-sidebar-bg/70 px-3 py-1 text-xs font-medium text-primary backdrop-blur-sm"
        >
          Delivering trust worldwide
        </motion.p>

        <motion.h1
          initial={initial}
          animate="show"
          custom={1}
          variants={fadeUp}
          className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          Your Shipments.
          <br />
          Our Network.
          <br />
          Delivered Worldwide.
        </motion.h1>

        <motion.p
          initial={initial}
          animate="show"
          custom={2}
          variants={fadeUp}
          className="max-w-md text-base text-sidebar-foreground"
        >
          Ship documents and packages with reliable logistics solutions, competitive options
          and complete shipment visibility.
        </motion.p>

        <motion.div
          initial={initial}
          animate="show"
          custom={3}
          variants={fadeUp}
          className="w-full max-w-md space-y-3 rounded-xl border border-sidebar-border bg-card p-4 text-left shadow-lg"
        >
          <p className="text-sm font-semibold text-foreground">Track Your Shipment</p>
          <TrackingLookupPanel />
        </motion.div>

        <motion.div initial={initial} animate="show" custom={4} variants={fadeUp}>
          <Button size="lg" className="w-full sm:w-auto" onClick={() => gate("/quote")}>
            Get a Quote
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
