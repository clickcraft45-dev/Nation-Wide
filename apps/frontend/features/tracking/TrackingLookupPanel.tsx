"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useTrackingLookup } from "./use-tracking-lookup";
import { TrackingSearchForm } from "./TrackingSearchForm";
import { TrackingTimeline } from "./TrackingTimeline";
import { ErrorState } from "@/components/ui/page-state";
import { cn } from "@/lib/utils/cn";

interface TrackingLookupPanelProps {
  /** Pre-fills the input and fires the lookup once on mount — used by /track/[trackingId]. */
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
  const { state, search } = useTrackingLookup();
  const hasAutoSearched = useRef(false);
  const celebrated = useRef<string | null>(null);

  // A delivered parcel is the one genuinely good outcome of this form — mark it. Keyed on the
  // tracking number so re-renders don't re-fire, and skipped entirely under reduced motion.
  useEffect(() => {
    if (state.status !== "success" || state.result.currentStatus !== "DELIVERED") return;
    const id = state.result.internalTrackingNumber;
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
      void search(initialTrackingId);
    }
  }, [initialTrackingId, search]);

  return (
    <div className={cn("space-y-3", className)}>
      <TrackingSearchForm
        onSubmit={search}
        isLoading={state.status === "loading"}
        initialValue={initialTrackingId}
        submitButtonClassName={submitButtonClassName}
      />

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground" role="status">
          Tracking shipment…
        </p>
      )}
      {state.status === "not-found" && (
        <ErrorState message="We couldn't find a shipment with that tracking ID." />
      )}
      {state.status === "error" && <ErrorState message={state.message} />}
      {state.status === "success" && <TrackingTimeline result={state.result} />}
    </div>
  );
}
