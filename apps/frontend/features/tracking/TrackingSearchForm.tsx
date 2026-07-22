"use client";

import { useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";

interface TrackingSearchFormProps {
  onSubmit: (trackingNumber: string) => void;
  isLoading?: boolean;
  initialValue?: string;
}

export function TrackingSearchForm({
  onSubmit,
  isLoading,
  initialValue,
}: TrackingSearchFormProps) {
  const [value, setValue] = useState(initialValue ?? "");

  return (
    <form
      className="flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <div className="flex-1">
        <SearchInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter your tracking number"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        {isLoading ? "Searching…" : "Track"}
      </Button>
    </form>
  );
}
