"use client";

import { useState } from "react";

interface TrackingSearchFormProps {
  onSubmit: (trackingNumber: string) => void;
  isLoading?: boolean;
}

export function TrackingSearchForm({ onSubmit, isLoading }: TrackingSearchFormProps) {
  const [value, setValue] = useState("");

  return (
    <form
      className="flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter your tracking number"
        className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={isLoading}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isLoading ? "Searching…" : "Track"}
      </button>
    </form>
  );
}
