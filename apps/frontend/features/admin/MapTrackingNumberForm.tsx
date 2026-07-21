"use client";

import { useState } from "react";

export function MapTrackingNumberForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (externalTrackingNumber: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) void onSubmit(value.trim());
      }}
    >
      <input
        type="text"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Carrier tracking number"
        className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isSubmitting ? "Saving…" : "Map"}
      </button>
    </form>
  );
}
