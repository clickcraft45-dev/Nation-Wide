"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Map as MapIcon } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { PickupCard, isOpenRequest } from "@/components/partner/pickup-card";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";

// Same cadence as the map: a new request shows up without the partner pulling to refresh.
const REFRESH_MS = 30_000;

// The partner app's landing screen: open pickup requests any partner can accept, newest first.
export default function PartnerRequestsPage() {
  const [requests, setRequests] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiClient
      .get<PickupRequestDto[]>("/partner/pickup-requests")
      .then((rows) => {
        setRequests(rows.filter(isOpenRequest).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, "Failed to load pickup requests.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pickup Requests</h1>
          <p className="text-sm text-muted-foreground">New pickups waiting for a partner. First to accept gets it.</p>
        </div>
        <Link
          href="/partner/map"
          className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-foreground active:bg-muted/60"
        >
          <MapIcon className="h-4 w-4" aria-hidden />
          Map
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && requests.length === 0 && (
        <EmptyState
          icon={<Inbox className="h-8 w-8" aria-hidden />}
          title="No new pickup requests"
          description="You'll get a notification the moment one comes in."
        />
      )}

      {!isLoading && !error && requests.length > 0 && (
        <div className="space-y-2">
          {requests.map((p) => (
            <PickupCard key={p.id} pickup={p} onClaimFailed={load} />
          ))}
        </div>
      )}
    </div>
  );
}
