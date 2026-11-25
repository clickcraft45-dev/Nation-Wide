"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useTrackingLookup } from "./use-tracking-lookup";
import { TrackingSearchForm } from "./TrackingSearchForm";
import { TrackingResults } from "./TrackingResults";
import { parseTrackingNumbers } from "@nationwide/shared-types";
import { ErrorState } from "@/components/ui/page-state";
import { cn } from "@/lib/utils/cn";

interface TrackingLookupPanelProps {
  /**
   * Pre-fills the input and fires the lookup once on mount — used by /track/[trackingId]. Several
   * numbers may be given, comma-separated (/track/NW-26-001,NW-26-002).
   */
  initialTrackingId?: string;
  className?: string;
  submitButtonClassName?: string;
}

// Public, unauthenticated shipment tracking. Shared by the homepage hero, the standalone /track
// page, and the /track/[trackingId] deep-link page — one state machine (useTrackingLookup), one
// set of idle/loading/success/not-found/error states, three presentations.
export function TrackingLookupPanel({
  initialTrackingId,
  className,
  submitButtonClassName,
}: TrackingLookupPanelProps) {
  const { state, search, reset } = useTrackingLookup();
  const hasAutoSearched = useRef(false);
  const celebrated = useRef<string | null>(null);

  // A delivered parcel is the one genuinely good outcome of this form — mark it. Keyed on the
  // tracking number so re-renders don't re-fire, and skipped entirely under reduced motion.
  useEffect(() => {
    // Only for a single parcel: a list with one delivered line is not a moment to celebrate.
    if (state.status !== "done" || state.items.length !== 1) return;
    const result = state.items[0].result;
    if (result?.currentStatus !== "DELIVERED") return;
    const id = result.internalTrackingNumber;
    if (celebrated.current === id) return;
    celebrated.current = id;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    void confetti({
      particleCount: 70,
      spread: 62,
      startVelocity: 28,
      scalar: 0.85,
      origin: { y: 0.7 },
      colors: ["#ffffff", "#d4d4d8", "#a1a1aa", "#52525b", "#18181b"],
    });
  }, [state]);

  useEffect(() => {
    if (initialTrackingId && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      void search(parseTrackingNumbers(initialTrackingId));
    }
  }, [initialTrackingId, search]);

  return (
    <div className={cn("space-y-3", className)}>
      <TrackingSearchForm
        onSubmit={search}
        onClear={reset}
        isLoading={state.status === "loading"}
        initialValue={initialTrackingId}
        submitButtonClassName={submitButtonClassName}
      />

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground" role="status">
          {state.count > 1 ? `Tracking ${state.count} shipments…` : "Tracking shipment…"}
        </p>
      )}
      {state.status === "error" && <ErrorState message={state.message} />}
      {state.status === "done" && <TrackingResults items={state.items} />}
    </div>
  );
}
