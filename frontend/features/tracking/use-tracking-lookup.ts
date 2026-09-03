"use client";

import { useCallback, useState } from "react";
import type { TrackingResultDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";

export type TrackingLookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: TrackingResultDto }
  | { status: "not-found" }
  | { status: "error"; message: string };

// One fetch implementation shared by the hero's inline tracker, the standalone /track page, and
// the /track/[trackingId] deep-link page — all three need the same idle/loading/success/
// not-found/error states, just presented in slightly different layouts.
export function useTrackingLookup() {
  const [state, setState] = useState<TrackingLookupState>({ status: "idle" });

  const search = useCallback(async (trackingNumber: string) => {
    setState({ status: "loading" });
    try {
      const result = await apiClient.get<TrackingResultDto>(
        `/tracking/${encodeURIComponent(trackingNumber)}`,
      );
      setState({ status: "success", result });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setState({ status: "not-found" });
      } else {
        setState({
          status: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, search, reset };
}
