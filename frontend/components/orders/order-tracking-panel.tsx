"use client";

import { useEffect, useState } from "react";
import type { ShipmentSummaryDto, TrackingResultDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ProgressTimeline } from "@/components/ui/progress-timeline";
import { Timeline } from "@/components/ui/timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveMilestones } from "@/lib/tracking-milestones";
import { OrderStatusCard } from "./order-status-card";

/**
 * Live tracking for an order, for the rail beside the order detail.
 *
 * The order screen already knew a shipment's status code; what it could not show was the journey
 * — that lives on the tracking endpoint, keyed by the internal tracking number, and was only
 * reachable by leaving the page for /tracking. Same endpoint the customer tracking page uses, so
 * an admin looking at an order sees exactly what the customer sees.
 *
 * ONE SHIPMENT AT A TIME. Most orders have one; the few that have several get a selector rather
 * than a stack of timelines, because two journeys drawn one above the other read as one journey
 * that went backwards.
 */
export function OrderTrackingPanel({ shipments }: { shipments: ShipmentSummaryDto[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(shipments[0]?.id ?? null);
  const [result, setResult] = useState<TrackingResultDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = shipments.find((s) => s.id === selectedId) ?? shipments[0] ?? null;
  // The carrier AWB once mapped — /tracking resolves it and pulls live scans from the carrier.
  const trackingNumber = selected?.externalTrackingNumber ?? selected?.internalTrackingNumber ?? null;

  useEffect(() => {
    if (!trackingNumber) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    apiClient
      .get<TrackingResultDto>(`/tracking/${encodeURIComponent(trackingNumber)}`)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        // A shipment with no carrier number yet 404s here, which is not an error worth shouting
        // about — the status card already says "awaiting pickup" and that is the true answer.
        if (!cancelled) {
          setResult(null);
          setError("No carrier scans for this shipment yet.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackingNumber]);

  if (shipments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nothing to track — this order has no shipments yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const milestones = result ? deriveMilestones(result.events) : [];
  // Events arrive oldest-first; the rail shows the latest scans, newest at the top.
  const recentEvents = result ? [...result.events].reverse().slice(0, 6) : [];

  return (
    <div className="space-y-4">
      <OrderStatusCard status={result?.currentStatus ?? null} trackingNumber={trackingNumber} />

      {shipments.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {shipments.map((shipment) => (
            <button
              key={shipment.id}
              type="button"
              onClick={() => setSelectedId(shipment.id)}
              className={
                shipment.id === selected?.id
                  ? "rounded-full bg-primary px-3 py-1 font-mono text-xs text-primary-foreground"
                  : "rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              }
            >
              {shipment.internalTrackingNumber}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {!isLoading && error && <p className="text-sm text-muted-foreground">{error}</p>}

          {!isLoading && result && (
            <>
              <div>
                <h3 className="mb-4 text-sm font-semibold text-foreground">Progress</h3>
                <ProgressTimeline
                  milestones={milestones.map((milestone) => ({
                    label: milestone.label,
                    timestamp: milestone.reachedAt ? formatDateTime(milestone.reachedAt) : null,
                  }))}
                />
              </div>

              {recentEvents.length > 0 && (
                <div>
                  <h3 className="mb-4 text-sm font-semibold text-foreground">Latest scans</h3>
                  {/* Keyed on the tracking number so switching shipments replays the stagger
                      instead of leaving the previous shipment's rows in place. */}
                  <Timeline
                    key={result.internalTrackingNumber}
                    events={recentEvents.map((event) => ({
                      label: event.displayLabel,
                      timestamp: formatDateTime(event.eventTime),
                      location: event.location ?? undefined,
                    }))}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
