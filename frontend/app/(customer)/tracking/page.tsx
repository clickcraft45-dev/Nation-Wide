"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, MapPin, X } from "lucide-react";
import { parseTrackingNumbers, type OrderDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";
import { TrackingResults } from "@/features/tracking/TrackingResults";
import { useTrackingLookup } from "@/features/tracking/use-tracking-lookup";
import { ErrorState } from "@/components/ui/page-state";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import {
  clearTrackingHistory,
  readTrackingHistory,
  rememberTrackingNumber,
} from "@/lib/tracking-history";

function CustomerTrackingPageInner() {
  const searchParams = useSearchParams();
  const initialTracking = searchParams.get("tracking") ?? undefined;
  const { user } = useAuth();

  // Starts empty and is filled after mount: localStorage does not exist during the server render,
  // so seeding it in useState would render one thing on the server and another on the client.
  const [history, setHistory] = useState<string[]>([]);
  const [activeOrders, setActiveOrders] = useState<OrderDto[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(readTrackingHistory());
  }, []);

  useEffect(() => {
    if (!user) return;
    apiClient
      .get<OrderDto[]>("/orders/me")
      .then((orders) =>
        setActiveOrders(
          orders.filter((order) => order.shipments[0]?.currentStatus !== "DELIVERED"),
        ),
      )
      .catch(() => setActiveOrders([]));
  }, [user]);

  // Only numbers that actually resolved are remembered — a history full of the visitor's typos
  // is worse than no history.
  const { state, search } = useTrackingLookup({
    onFound: (result) => setHistory(rememberTrackingNumber(result.internalTrackingNumber)),
  });
  const handleSearch = (trackingNumber: string) => void search([trackingNumber]);

  useEffect(() => {
    // Auto-loading from a deep-linked ?tracking= param on mount is a one-shot lookup, not a
    // subscription to external state — there's nothing to synchronize against afterward.
    if (initialTracking) void search(parseTrackingNumbers(initialTracking));
  }, [initialTracking, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Track a shipment</h1>
        <p className="text-sm text-muted-foreground">
          Enter a NationWide tracking number to see its current status, or up to 30, one per line.
        </p>
      </div>

      <TrackingSearchForm
        onSubmit={(numbers) => void search(numbers)}
        isLoading={state.status === "loading"}
        initialValue={initialTracking}
      />

      {activeOrders.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Your active shipments</span>
          {activeOrders.map((order) => {
            const shipment = order.shipments[0];
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => shipment && handleSearch(shipment.internalTrackingNumber)}
                disabled={!shipment}
                className="glass glass-interactive flex w-full max-w-xl items-center justify-between rounded-2xl p-3 text-left active:bg-muted/60 disabled:opacity-60"
              >
                <span className="flex items-center gap-2 font-mono text-sm text-foreground">
                  <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                </span>
                <TrackingStatusBadge status={shipment?.currentStatus} />
              </button>
            );
          })}
        </div>
      )}

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
              onClick={() => handleSearch(trackingNumber)}
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

      {state.status === "loading" && state.count > 1 && (
        <p className="text-sm text-muted-foreground" role="status">
          Tracking {state.count} shipments…
        </p>
      )}
      {state.status === "error" && <ErrorState message={state.message} />}
      {state.status === "done" && <TrackingResults items={state.items} />}
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
