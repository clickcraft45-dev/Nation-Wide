"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, X } from "lucide-react";
import type { TrackingResultDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";
import { TrackingTimeline } from "@/features/tracking/TrackingTimeline";
import { ErrorState } from "@/components/ui/page-state";
import {
  clearTrackingHistory,
  readTrackingHistory,
  rememberTrackingNumber,
} from "@/lib/tracking-history";

function CustomerTrackingPageInner() {
  const searchParams = useSearchParams();
  const initialTracking = searchParams.get("tracking") ?? undefined;

  const [result, setResult] = useState<TrackingResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Starts empty and is filled after mount: localStorage does not exist during the server render,
  // so seeding it in useState would render one thing on the server and another on the client.
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(readTrackingHistory());
  }, []);

  async function handleSearch(trackingNumber: string) {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiClient.get<TrackingResultDto>(
        `/tracking/${encodeURIComponent(trackingNumber)}`,
      );
      setResult(data);
      // Only numbers that actually resolved are remembered — a history full of the visitor's
      // typos is worse than no history.
      setHistory(rememberTrackingNumber(data.internalTrackingNumber));
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

  useEffect(() => {
    // Auto-loading from a deep-linked ?tracking= param on mount is a one-shot lookup, not a
    // subscription to external state — there's nothing to synchronize against afterward.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialTracking) void handleSearch(initialTracking);
  }, [initialTracking]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Track a shipment</h1>
        <p className="text-sm text-muted-foreground">
          Enter your NationWide tracking number to see its current status.
        </p>
      </div>

      <TrackingSearchForm
        onSubmit={handleSearch}
        isLoading={isLoading}
        initialValue={initialTracking}
      />

      {history.length > 0 && (
        <div className="flex w-full max-w-xl flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" aria-hidden />
            Recently tracked
          </span>
          {history.map((trackingNumber) => (
            <button
              key={trackingNumber}
              type="button"
              onClick={() => void handleSearch(trackingNumber)}
              className="glass-pill rounded-full border px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {trackingNumber}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              clearTrackingHistory();
              setHistory([]);
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear
          </button>
        </div>
      )}

      {error && <ErrorState message={error} />}
      {result && <TrackingTimeline result={result} />}
    </div>
  );
}

export default function CustomerTrackingPage() {
  return (
    <Suspense fallback={null}>
      <CustomerTrackingPageInner />
    </Suspense>
  );
}
