"use client";

import { useEffect, useRef } from "react";
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
