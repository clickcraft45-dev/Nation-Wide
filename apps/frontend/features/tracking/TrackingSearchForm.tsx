"use client";

import { useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface TrackingSearchFormProps {
  onSubmit: (trackingNumber: string) => void;
  isLoading?: boolean;
  initialValue?: string;
  /** Override for the submit button — needed when the form sits on a colored surface (e.g. the
   * customer dashboard's blue hero card) where the default primary-on-primary would vanish. */
  submitButtonClassName?: string;
}

// Stacked full-width input + full-width button below sm — a one-handed mobile tracking form is
// the public site's single most important control, so it gets the 44px+ touch targets and
// unambiguous tap zones that a compact inline row can't. From sm up there's enough width for the
// two controls to sit on one line without cramping the input.
export function TrackingSearchForm({
  onSubmit,
  isLoading,
  initialValue,
  submitButtonClassName,
}: TrackingSearchFormProps) {
  const [value, setValue] = useState(initialValue ?? "");

  return (
    <form
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <div className="flex-1">
        <SearchInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter Order ID / Tracking ID"
          className="h-11 pl-10 text-base"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        isLoading={isLoading}
        className={cn("w-full sm:w-auto", submitButtonClassName)}
      >
        {isLoading ? "Searching…" : "Track Shipment"}
      </Button>
    </form>
  );
}
