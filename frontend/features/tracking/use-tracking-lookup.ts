"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackingBatchItemDto, TrackingResultDto } from "@nationwide/shared-types";
import { MAX_TRACKING_BATCH } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";

export type TrackingLookupState =
  | { status: "idle" }
  | { status: "loading"; count: number }
  | { status: "done"; items: TrackingBatchItemDto[] }
  | { status: "error"; message: string };

/**
 * Looks up one shipment or up to MAX_TRACKING_BATCH at once. Shared by the homepage hero, /track,
 * the customer portal and the B2B portal, so every surface answers a pasted list the same way.
 *
 * One number takes the single lookup (cacheable, and its own throttle); several take
 * POST /tracking/batch, where each number gets its own answer and a miss never fails the rest.
 */
export function useTrackingLookup({
  onFound,
}: {
  /** Called with every shipment that resolved: for the "recently tracked" list. */
  onFound?: (result: TrackingResultDto) => void;
} = {}) {
  const [state, setState] = useState<TrackingLookupState>({ status: "idle" });
  const seq = useRef(0);
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    onFoundRef.current = onFound;
  });

  const search = useCallback(async (input: string[]) => {
    const numbers = input.slice(0, MAX_TRACKING_BATCH);
    if (numbers.length === 0) return;
    const mine = ++seq.current;
    setState({ status: "loading", count: numbers.length });
    try {
      let items: TrackingBatchItemDto[];
      if (numbers.length === 1) {
        const reference = numbers[0];
        try {
          const result = await apiClient.get<TrackingResultDto>(`/tracking/${encodeURIComponent(reference)}`);
          items = [{ reference, result, error: null }];
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          items = [{ reference, result: null, error: "NOT_FOUND" }];
        }
      } else {
        items = await apiClient.post<TrackingBatchItemDto[]>("/tracking/batch", { numbers });
      }
      if (mine !== seq.current) return;
      for (const item of items) if (item.result) onFoundRef.current?.(item.result);
      setState({ status: "done", items });
    } catch (e) {
      if (mine !== seq.current) return;
      setState({
        status: "error",
        message:
          e instanceof ApiError && e.status === 429
            ? "Too many lookups in a short time. Wait a minute, then try again."
            : "Temporarily unable to fetch live status. Please try again shortly.",
      });
    }
  }, []);

  const reset = useCallback(() => {
    seq.current++;
    setState({ status: "idle" });
  }, []);

  return { state, search, reset };
}
