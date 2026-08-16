"use client";

import { Button } from "@/components/ui/button";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { TrackingLookupPanel } from "@/features/tracking/TrackingLookupPanel";
import { HeroPicture } from "@/components/marketing/hero-picture";

// Mobile-first: read top-to-bottom, this literally IS the mobile order — tagline, headline,
// supporting line, tracking (the dominant action), a compact hero visual, then the secondary
// Get a Quote CTA. There is exactly one <HeroPicture> in the DOM (a single <picture> that itself
// resolves to the right art-directed source for the viewport) — at lg+ it's grid-repositioned
// into a right-hand column via col/row-start rather than duplicated into a second hidden copy,
// which would risk double-fetching once these placeholders become real photography.
export function MarketingHero() {
  const gate = useAuthGate();

  return (
    <section id="track" className="relative overflow-hidden bg-sidebar-bg">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:py-14 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-24">
        <div className="order-1 space-y-5 sm:space-y-6 lg:order-none lg:col-start-1 lg:row-start-1">
          <p className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Delivering trust worldwide
          </p>

          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
            Your Shipments.
            <br />
            Our Network.
            <br />
            Delivered Worldwide.
          </h1>

          <p className="max-w-md text-base text-sidebar-foreground">
            Ship documents and packages with reliable logistics solutions, competitive options
            and complete shipment visibility.
          </p>

          <div className="max-w-md space-y-3 rounded-xl border border-sidebar-border bg-card p-4 shadow-lg">
            <p className="text-sm font-semibold text-foreground">Track Your Shipment</p>
            <TrackingLookupPanel />
          </div>
        </div>

        <div className="order-2 relative aspect-[16/9] w-full max-w-md overflow-hidden rounded-2xl lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:aspect-square lg:max-w-none">
          <HeroPicture className="absolute inset-0 h-full w-full object-cover" />
        </div>

        <div className="order-3 lg:order-none lg:col-start-1 lg:row-start-2">
          <Button size="lg" className="w-full sm:w-auto" onClick={() => gate("/quote")}>
            Get a Quote
          </Button>
        </div>
      </div>
    </section>
  );
}
