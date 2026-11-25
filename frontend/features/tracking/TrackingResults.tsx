"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TrackingBatchItemDto } from "@nationwide/shared-types";
import { ErrorState } from "@/components/ui/page-state";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils/cn";
import { TrackingTimeline } from "./TrackingTimeline";

function formatShort(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * What a tracking search found. One number: its full timeline, as it always was. Several: one
 * row per number in the order they were entered, each opening to the same full timeline, with the
 * numbers that were not found kept in the list so the sender can see which line to fix.
 */
export function TrackingResults({ items }: { items: TrackingBatchItemDto[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 1) {
    const [item] = items;
    if (item.result) return <TrackingTimeline result={item.result} />;
    return (
      <ErrorState
        message={
          item.error === "NOT_FOUND"
            ? "We couldn't find a shipment with that tracking ID."
            : "Temporarily unable to fetch live status. Please try again shortly."
        }
      />
    );
  }

  const found = items.filter((i) => i.result).length;
  const missing = items.length - found;

  return (
    <div className="w-full max-w-xl space-y-3">
      <p className="text-sm text-muted-foreground" role="status">
        {found} of {items.length} found
        {missing > 0 && ` · ${missing} need${missing === 1 ? "s" : ""} checking`}
      </p>
      <ul className="space-y-2">
        {items.map((item) => {
          const result = item.result;
          const isOpen = open === item.reference;
          const newest = result?.events[result.events.length - 1];
          const panelId = `tracking-row-${item.reference}`;
          return (
            <li key={item.reference} className="glass overflow-hidden rounded-2xl">
              {result ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : item.reference)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm text-foreground">
                      {result.internalTrackingNumber}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        result.carrier?.name,
                        newest?.location,
                        newest ? formatShort(newest.eventTime) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No scans yet"}
                    </span>
                  </span>
                  <TrackingStatusBadge status={result.currentStatus} />
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
              ) : (
                <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                    {item.reference}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-warning">
                    {item.error === "NOT_FOUND" ? "Not found, check the number" : "Couldn't load, try again"}
                  </span>
                </div>
              )}
              {result && isOpen && (
                <div id={panelId} className="border-t border-(--glass-edge) p-3 sm:p-4">
                  <TrackingTimeline result={result} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
