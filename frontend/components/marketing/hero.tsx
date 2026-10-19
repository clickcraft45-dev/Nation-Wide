"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight, Building2, Radar } from "lucide-react";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { TrackingLookupPanel } from "@/features/tracking/TrackingLookupPanel";
import { HeroGlobe } from "@/components/marketing/hero-globe";
import { TypingText } from "@/components/marketing/typing-text";
import { AssetImage } from "@/components/marketing/asset-image";
import { HERO_IMAGES } from "@/lib/constants/assets";

// The three photos beside the copy: what a sender actually experiences, in order. xl+ only, where
// there is room either side of the 768px column; below that the hero stays copy, tracking, planet.
const HERO_PHOTOS = [
  {
    image: HERO_IMAGES.handover,
    label: "Pickup from your door",
    className: "left-[max(2rem,calc(50%-36rem))] top-36 w-52 aspect-[4/5] -rotate-3",
    delay: "560ms",
  },
  {
    image: HERO_IMAGES.air,
    label: "Flown to 240+ countries",
    className: "right-[max(2rem,calc(50%-37rem))] top-32 w-60 aspect-[3/2] rotate-2",
    delay: "640ms",
  },
  {
    image: HERO_IMAGES.warehouse,
    label: "Packed and dispatched",
    className: "right-[max(4rem,calc(50%-33rem))] top-[22rem] w-40 aspect-[2/3] -rotate-2",
    delay: "720ms",
  },
] as const;

const HEADLINE_WORDS = ["Worldwide.", "On Time.", "With Care.", "Door to Door."];

// Each word gets its own entrance, so the headline assembles itself rather than sliding in as one
// slab. Two lines on desktop: the statement, then "Delivered" with the cycling word.
const HEADLINE_WORDS_FIRST_LINE = ["Your", "Shipments.", "Our", "Network."];

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
  // Reduced motion flattens the ranges instead of dropping the style prop: useReducedMotion() is
  // null on the server, so a conditional style rendered differently on each side and broke hydration.
  const k = reduceMotion ? 0 : 1;
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, 140 * k]);
  const auroraYSlow = useTransform(scrollYProgress, [0, 1], [0, 70 * k]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 40 * k]);

  // The planet swells and rises as the hero scrolls away — springs so it eases rather than
  // tracking the wheel one-to-one, which is what makes the move read as smooth. Kept modest:
  // a bigger rise pushed the black glass up over the headline and the tracking panel.
  const planetScale = useSpring(useTransform(scrollYProgress, [0, 1], [1, 1 + 0.18 * k]), {
    stiffness: 70,
    damping: 22,
    mass: 0.5,
  });
  const planetY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -80 * k]), {
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
          section scrolls away.

          GEOMETRY. HeroGlobe draws the sphere at radius = 0.4 × the box's short side, so a square
          box of width W holds a sphere of diameter 0.8W centred in it. Translating that box down
          by `t` of its own height leaves a cap of (0.9 − t)·W standing above the section floor —
          at w=110vw/max-1200 and t=76% that is ~0.14W, i.e. ≈170px on a laptop. The copy's
          bottom padding below has to stay larger than that number, and the two were previously
          sized so far apart (a 456px cap under 480px of padding) that the hero ran well past one
          screen and the dome could only be reached by scrolling. */}
      <motion.div
        style={{ scale: planetScale, y: planetY }}
        className="absolute inset-x-0 bottom-0 z-0 flex origin-bottom justify-center"
      >
        <div className="aspect-square w-[110vw] max-w-[1200px] translate-y-[76%]">
          <HeroGlobe className="h-full w-full" />
        </div>
      </motion.div>

      {/* Photo cards: decorative (the copy says the same thing), so hidden from assistive tech.
          Above the planet (z-0), below the copy (z-10). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] hidden xl:block">
        {HERO_PHOTOS.map(({ image, label, className, delay }) => (
          <figure
            key={image.src}
            className={`glass-panel absolute animate-rise-in rounded-3xl p-2 ${className}`}
            style={{ animationDelay: delay }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-2xl">
              <AssetImage src={image.src} alt="" sizes="240px" priority />
            </div>
            <figcaption className="glass-panel absolute -bottom-3 left-4 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-foreground/80">
              {label}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* pt clears the pinned navbar, which is fixed and so overlays this hero rather than
          sitting above it in flow. */}
      <motion.div
        style={{ y: contentY }}
        /* Bottom padding is the planet's headroom — see the geometry note above. It must clear
           the cap (no copy may sit on the black glass) and nothing more, because every pixel
           beyond that is hero the visitor has to scroll past. */
        className="relative z-10 mx-auto max-w-3xl px-6 pb-40 pt-20 sm:pb-48 sm:pt-24 lg:pb-52 lg:pt-28"
      >
        <div className="flex flex-col items-center space-y-6 text-center">
          <p className="glass-panel inline-flex animate-slide-in-left items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground/80">
            {/* Brand red, not --danger: this is the identity accent on the tagline, not a
                failure signal. See the SIGNAL RED note in globals.css. */}
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-red opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-red" />
            </span>
            Delivering trust worldwide
          </p>

          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
            <span className="block">
              {HEADLINE_WORDS_FIRST_LINE.map((word, wordIndex) => (
                <span
                  key={word}
                  className="mr-[0.25em] inline-block animate-rise-in"
                  style={{ animationDelay: `${wordIndex * 90}ms` }}
                >
                  {word}
                </span>
              ))}
            </span>
            <span className="block min-h-[1.15em]">
              <span className="mr-[0.25em] inline-block animate-rise-in [animation-delay:360ms]">
                Delivered
              </span>
              <span className="inline-block animate-rise-in bg-gradient-to-r from-foreground via-zinc-600 to-zinc-400 bg-clip-text text-transparent [animation-delay:440ms]">
                <TypingText words={HEADLINE_WORDS} />
              </span>
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

          {/* Businesses that ship regularly want an account, not a one-off quote — this is the
              one line above the fold that says so, and it lands on the request form. */}
          <a
            href="#business"
            className="group inline-flex animate-slide-in-left flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground [animation-delay:640ms] hover:text-foreground"
          >
            <Building2 className="h-4 w-4 text-primary" aria-hidden />
            <span className="whitespace-nowrap">Shipping for a business?</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-medium text-foreground underline underline-offset-4">
                Request an account
              </span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </a>
        </div>
      </motion.div>
    </section>
  );
}
