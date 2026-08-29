"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import {
  ArrowRight,
  ChevronDown,
  MapPin,
  Radar,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { TrackingLookupPanel } from "@/features/tracking/TrackingLookupPanel";
import { HeroGlobe } from "@/components/marketing/hero-globe";
import { TypingText } from "@/components/marketing/typing-text";

const HEADLINE_WORDS = ["Worldwide.", "On Time.", "With Care.", "Door to Door."];

// Each word gets its own entrance, so the headline assembles itself rather than sliding in as one
// slab. Line breaks are part of the data — the copy is written to break exactly here.
const HEADLINE_LINES = [["Your", "Shipments."], ["Our", "Network."]];

const HIGHLIGHTS = [
  { icon: MapPin, label: "Live tracking" },
  { icon: Truck, label: "Door-to-door pickup" },
  { icon: ShieldCheck, label: "Trusted carrier network" },
];

// Mobile-first, one centred column on white: tagline → headline → supporting line → tracking
// (the dominant, sign-in-free action) → CTAs, stacked above the planet. The planet is
// <HeroGlobe>, the same canvas as before but drawn wider than the viewport and sunk below the
// fold so only its northern cap shows — it sizes itself to its container, so there is nothing to
// art-direct per breakpoint beyond the headroom below the copy.
//
// The staggered entrance is pure CSS (animate-slide-in-*, whose fill-mode is "both") rather than a
// scroll-reveal: this is the first thing above the fold, so it must never need JS to be visible.
export function MarketingHero() {
  const gate = useAuthGate();
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  // Aurora drifts at a fraction of scroll speed, so the hero gains depth as it leaves.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const auroraYSlow = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 40]);

  // The planet swells and rises as the hero scrolls away — springs so it eases rather than
  // tracking the wheel one-to-one, which is what makes the move read as smooth.
  const planetScale = useSpring(useTransform(scrollYProgress, [0, 1], [1, 1.45]), {
    stiffness: 70,
    damping: 22,
    mass: 0.5,
  });
  const planetY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -170]), {
    stiffness: 70,
    damping: 22,
    mass: 0.5,
  });

  return (
    <section
      id="track"
      ref={sectionRef}
      className="relative isolate overflow-hidden bg-background"
    >
      {/* Dynamic aurora field — three drifting colour wells behind a blur, the "living glass"
          backdrop the frosted panels below refract. Tinted zinc rather than white now that the
          surface underneath is white. Purely decorative, motion-reduce safe. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          style={{ y: auroraY }}
          className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-zinc-300/45 blur-[130px] animate-aurora"
        />
        <motion.div
          style={{ y: auroraYSlow }}
          className="absolute -right-32 top-1/4 h-[32rem] w-[32rem] rounded-full bg-zinc-400/35 blur-[130px] animate-aurora-slow"
        />
        <motion.div
          style={{ y: auroraY }}
          className="absolute -bottom-48 left-1/3 h-[34rem] w-[34rem] rounded-full bg-zinc-200/60 blur-[140px] animate-aurora-slower"
        />
        <div className="absolute inset-0 bg-hero-grid" />
      </div>

      {/* The planet — the page's one big piece of black glass, sunk below the fold so only its
          northern cap rises into the hero. It sits behind the copy (z-0) and grows as the
          section scrolls away. Sinking it less than half a radius is what keeps real continents
          in the visible band rather than just the limb. */}
      <motion.div
        style={reduceMotion ? undefined : { scale: planetScale, y: planetY }}
        className="absolute inset-x-0 bottom-0 z-0 flex origin-bottom justify-center"
      >
        <div className="aspect-square w-[150vw] max-w-[1900px] translate-y-[66%]">
          <HeroGlobe className="h-full w-full" />
        </div>
      </motion.div>

      {/* pt clears the overlaying navbar (see MarketingNavbar's -mb-16 on the homepage). */}
      <motion.div
        style={{ y: contentY }}
        /* Bottom padding is the planet's headroom: its cap rises ~30% of the sphere's width above
           the section floor, and no copy may sit on the black glass. */
        className="relative z-10 mx-auto max-w-3xl px-6 pb-44 pt-24 sm:pb-[19rem] sm:pt-28 lg:pb-[30rem] lg:pt-36"
      >
        <div className="flex flex-col items-center space-y-6 text-center">
          <p className="glass-panel inline-flex animate-slide-in-left items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground/80">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Delivering trust worldwide
          </p>

          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {HEADLINE_LINES.map((line, lineIndex) => (
              <span key={lineIndex} className="block">
                {line.map((word, wordIndex) => (
                  <span
                    key={word}
                    className="mr-[0.25em] inline-block animate-rise-in"
                    style={{ animationDelay: `${(lineIndex * 2 + wordIndex) * 90}ms` }}
                  >
                    {word}
                  </span>
                ))}
              </span>
            ))}
            <span className="block animate-rise-in [animation-delay:360ms]">Delivered</span>
            <span className="block min-h-[1.15em] animate-rise-in bg-gradient-to-r from-foreground via-zinc-600 to-zinc-400 bg-clip-text text-transparent [animation-delay:440ms]">
              <TypingText words={HEADLINE_WORDS} />
            </span>
          </h1>

          <p className="max-w-xl animate-slide-in-left text-base leading-relaxed text-muted-foreground [animation-delay:440ms] sm:text-lg">
            Ship documents and packages with reliable logistics solutions, competitive options
            and complete shipment visibility.
          </p>

          {/* Frosted panel — the one element that overlaps the planet, so it keeps a heavier
              white than the rest of the glass: a successful lookup renders the full tracking
              timeline inside it on the app's standard light tokens, and that has to stay
              readable whether it lands on white page or black planet. */}
          <div className="glass-panel w-full max-w-lg animate-slide-in-left overflow-hidden rounded-2xl bg-white/85 text-left backdrop-blur-2xl [animation-delay:520ms]">
            <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Radar className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Track your shipment</p>
                <p className="truncate text-xs text-muted-foreground">No sign-in needed</p>
              </div>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-[11px] font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                Live
              </span>
            </div>
            <div className="p-4">
              <TrackingLookupPanel />
              <p className="mt-3 text-xs text-muted-foreground">
                Use the Order ID from your confirmation, or the carrier tracking ID.
              </p>
            </div>
          </div>

          <div className="flex w-full animate-slide-in-left flex-col gap-3 [animation-delay:600ms] sm:w-auto sm:flex-row sm:items-center sm:justify-center">
            <LiquidButton
              variant="primary"
              size="lg"
              className="group w-full overflow-hidden sm:w-auto"
              onClick={() => gate("/quote")}
            >
              {/* Sheen sweeping the primary CTA every few seconds. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-8 z-0 w-12 animate-sheen bg-white/25 blur-md"
              />
              Get a Quote
              <ArrowRight
                className="transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </LiquidButton>
            <LiquidButton asChild variant="default" size="lg" className="glass-panel w-full sm:w-auto">
              <a href="#how-it-works">How it works</a>
            </LiquidButton>
          </div>

          <div className="flex animate-slide-in-left flex-wrap justify-center gap-2 pt-1 [animation-delay:680ms]">
            {HIGHLIGHTS.map((item) => (
              <span
                key={item.label}
                className="glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-foreground/75"
              >
                <item.icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      <a
        href="#services"
        aria-label="Scroll to services"
        className="absolute inset-x-0 bottom-5 z-10 mx-auto hidden w-fit flex-col items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white lg:flex"
      >
        Scroll
        <ChevronDown className="h-4 w-4 animate-scroll-cue" aria-hidden />
      </a>
    </section>
  );
}
