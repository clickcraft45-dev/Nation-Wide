"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TrackingResultDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";
import { TrackingTimeline } from "@/features/tracking/TrackingTimeline";
import { ErrorState } from "@/components/ui/page-state";

function CustomerTrackingPageInner() {
  const searchParams = useSearchParams();
  const initialTracking = searchParams.get("tracking") ?? undefined;

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
