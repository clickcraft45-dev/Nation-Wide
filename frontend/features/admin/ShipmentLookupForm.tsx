"use client";

import { useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";

export function ShipmentLookupForm({
  onSubmit,
  isLoading,
  initialValue,
}: {
  onSubmit: (internalTrackingNumber: string) => void;
  isLoading: boolean;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue ?? "");

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <div className="flex-1">
        <SearchInput
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Internal tracking number (e.g. NW-DEMOTRACK1)"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        {isLoading ? "Searching…" : "Look up"}
      </Button>
    </form>
  );
}
