"use client";

import { useState } from "react";
import type { TrackingResultDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/page-state";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";
import { TrackingTimeline } from "@/features/tracking/TrackingTimeline";

export function MarketingHero({ onGetQuote }: { onGetQuote: () => void }) {
  const [result, setResult] = useState<TrackingResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSearch(trackingNumber: string) {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiClient.get<TrackingResultDto>(
        `/tracking/${encodeURIComponent(trackingNumber)}`,
      );
      setResult(data);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "We couldn't find that tracking number."
          : "Temporarily unable to fetch live status. Please try again shortly.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section id="track" className="relative overflow-hidden bg-sidebar-bg">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
        <div className="relative z-10 space-y-6">
          <p className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Trusted domestic &amp; international shipping
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Look up the status of your shipment.
          </h1>
          <p className="max-w-md text-base text-sidebar-foreground">
            Real-time tracking, reliable deliveries, and a team that treats every parcel like
            it matters — because it does.
          </p>

          <div className="max-w-md space-y-3 rounded-xl border border-sidebar-border bg-card p-4 shadow-lg">
            <TrackingSearchForm onSubmit={handleSearch} isLoading={isLoading} />
            {error && <ErrorState message={error} />}
            {result && <TrackingTimeline result={result} />}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" onClick={onGetQuote}>
              Get a Quote
            </Button>
            <a
              href="#services"
              className="inline-flex h-11 items-center justify-center rounded-md border border-sidebar-border px-6 text-sm font-medium text-white hover:bg-sidebar-accent"
            >
              Explore services
            </a>
          </div>
        </div>

        <HeroIllustration />
      </div>
    </section>
  );
}

function HeroIllustration() {
  return (
    <div className="relative z-10 hidden h-[420px] lg:block" aria-hidden>
      <svg viewBox="0 0 500 420" className="h-full w-full" fill="none">
        <circle cx="380" cy="90" r="140" stroke="#6366f1" strokeOpacity="0.25" strokeWidth="1" />
        <circle cx="380" cy="90" r="200" stroke="#6366f1" strokeOpacity="0.15" strokeWidth="1" />

        <path
          id="hero-route"
          d="M20 340 C 120 300, 160 200, 260 220 S 420 140, 470 60"
          stroke="#818cf8"
          strokeOpacity="0.4"
          strokeWidth="2"
          className="animate-route-draw"
        />
        <circle r="6" fill="#a5b4fc" style={{ offsetPath: "path('M20 340 C 120 300, 160 200, 260 220 S 420 140, 470 60')" }} className="animate-route-travel" />

        <circle cx="20" cy="340" r="5" fill="#4f46e5" />
        <circle cx="470" cy="60" r="5" fill="#4f46e5" />

        <g className="animate-soft-float">
          <rect x="150" y="150" width="56" height="56" rx="10" fill="#1e293b" stroke="#4338ca" strokeWidth="1.5" />
          <path d="M162 172 L178 162 L194 172 L194 194 L178 204 L162 194 Z" stroke="#818cf8" strokeWidth="1.5" fill="none" />
        </g>
        <g className="animate-soft-float" style={{ animationDelay: "1.2s" }}>
          <rect x="300" y="250" width="44" height="44" rx="8" fill="#1e293b" stroke="#4338ca" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}
