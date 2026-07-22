"use client";

import { useState } from "react";
import { TRACKING_STATUS_CODES, type TrackingStatusCode } from "@nationwide/shared-types";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export interface OverrideInput {
  status: TrackingStatusCode;
  location?: string;
  note?: string;
}

const STATUS_LABEL: Record<TrackingStatusCode, string> = {
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  EXCEPTION: "Exception",
};

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
      <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as TrackingStatusCode)}>
        {TRACKING_STATUS_CODES.map((code) => (
          <option key={code} value={code}>
            {STATUS_LABEL[code]}
          </option>
        ))}
      </NativeSelect>
      <Input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location (optional)"
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason for override (optional)"
      />
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        {isSubmitting ? "Saving…" : "Override status"}
      </Button>
    </form>
  );
}
