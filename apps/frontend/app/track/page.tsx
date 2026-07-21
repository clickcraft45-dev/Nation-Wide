"use client";

import { useState } from "react";
import type { TrackingResultDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";
import { TrackingTimeline } from "@/features/tracking/TrackingTimeline";

export default function TrackPage() {
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
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-24">
      <h1 className="text-2xl font-semibold">Track your shipment</h1>
      <TrackingSearchForm onSubmit={handleSearch} isLoading={isLoading} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <TrackingTimeline result={result} />}
    </div>
  );
}
