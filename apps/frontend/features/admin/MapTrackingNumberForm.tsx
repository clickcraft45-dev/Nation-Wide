"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
      <div className="flex-1">
        <Input
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Carrier tracking number"
        />
      </div>
      <Button type="submit" variant="secondary" isLoading={isSubmitting}>
        {isSubmitting ? "Saving…" : "Map"}
      </Button>
    </form>
  );
}
