"use client";

import { useState } from "react";
import { TRACKING_STATUS_CODES, type TrackingStatusCode } from "@nationwide/shared-types";

export interface OverrideInput {
  status: TrackingStatusCode;
  location?: string;
  note?: string;
}

export function OverrideStatusForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (input: OverrideInput) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [status, setStatus] = useState<TrackingStatusCode>(TRACKING_STATUS_CODES[0]);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          status,
          location: location.trim() || undefined,
          note: note.trim() || undefined,
        });
      }}
    >
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as TrackingStatusCode)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {TRACKING_STATUS_CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location (optional)"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason for override (optional)"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isSubmitting ? "Saving…" : "Override status"}
      </button>
    </form>
  );
}
