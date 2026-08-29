"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { FileText, CalendarClock, PackageCheck, Truck, MapPin } from "lucide-react";
import { SectionHeading } from "@/components/marketing/section-heading";

const STEPS = [
  {
    number: "01",
    icon: FileText,
    title: "Get Your Quote",
    description: "Enter your shipment details and compare available options.",
  },
  {
    number: "02",
    icon: CalendarClock,
    title: "Schedule Pickup",
    description: "Choose when and where your parcel should be collected.",
  },
  {
    number: "03",
    icon: PackageCheck,
    title: "We Collect",
    description: "Our pickup partner collects and verifies the parcel.",
  },
  {
    number: "04",
    icon: Truck,
    title: "We Ship",
    description: "The shipment moves through the selected logistics/carrier network.",
  },
  {
    number: "05",
    icon: MapPin,
    title: "Track",
    description: "Track the shipment using your Order ID / Tracking ID.",
  },
];

// One step of the desktop timeline. Its own component so the useTransform hooks below stay out of
// a .map() — hooks can't run in a loop whose length React can't rely on.
function DesktopStep({
  step,
  threshold,
  progress,
}: {
  step: (typeof STEPS)[number];
  threshold: number;
  progress: MotionValue<number>;
}) {
  // Each marker fills over the short stretch of scroll just before the line reaches it.
  const fill = useTransform(progress, [threshold - 0.12, threshold], [0, 1]);
  const scale = useTransform(fill, [0, 1], [0.9, 1]);

  return (
    <div className="relative flex flex-col items-center text-center">
      <motion.div
        style={{ scale }}
        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm"
      >
        <motion.span
          aria-hidden
          style={{ opacity: fill }}
          className="absolute inset-0 rounded-full bg-primary"
        />
        <step.icon className="relative h-5 w-5 mix-blend-difference text-white" aria-hidden />
      </motion.div>
      <p className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground">
        {step.number}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">{step.description}</p>
    </div>
  );
}

export function MarketingHowItWorks() {
  const timelineRef = useRef<HTMLDivElement>(null);

  // Starts drawing when the timeline is a little way into view and finishes before it leaves.
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ["start 85%", "end 55%"],
  });

  return (
    <section id="how-it-works" className="bg-muted py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          title="Shipping made simple"
          description="From quote to delivery — here's the complete journey."
        />

        {/* Desktop: horizontal steps with a connecting line that draws itself as you scroll. */}
        <div ref={timelineRef} className="relative mt-14 hidden lg:grid lg:grid-cols-5 lg:gap-6">
          <div className="pointer-events-none absolute left-0 right-0 top-6 h-px bg-border" aria-hidden />
          <motion.div
            aria-hidden
            style={{ scaleX: scrollYProgress }}
            className="pointer-events-none absolute left-0 right-0 top-6 h-px origin-left bg-primary"
          />
          {STEPS.map((step, i) => (
            <DesktopStep
              key={step.number}
              step={step}
              threshold={i / (STEPS.length - 1)}
              progress={scrollYProgress}
            />
          ))}
        </div>

        {/* Mobile/tablet: vertical timeline */}
        <div className="mt-12 space-y-8 lg:hidden">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-card text-primary shadow-sm">
                  <step.icon className="h-5 w-5" aria-hidden />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mt-2 w-px flex-1 bg-border" aria-hidden />
                )}
              </div>
              <div className="pb-2">
                <p className="text-xs font-semibold tracking-wide text-primary">
                  {step.number}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
