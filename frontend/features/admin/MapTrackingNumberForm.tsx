"use client";

import { useState } from "react";
import type { ShippingProviderDto } from "@nationwide/shared-types";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function MapTrackingNumberForm({
  providers,
  currentProviderId,
  onSubmit,
  isSubmitting,
}: {
  providers: ShippingProviderDto[];
  currentProviderId: string;
  onSubmit: (providerId: string, externalTrackingNumber: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [providerId, setProviderId] = useState(currentProviderId);
  const [value, setValue] = useState("");

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) void onSubmit(providerId, value.trim());
      }}
    >
      <NativeSelect
        value={providerId}
        onChange={(e) => setProviderId(e.target.value)}
        aria-label="Reseller / provider"
      >
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.name}
          </option>
        ))}
      </NativeSelect>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AWB / carrier tracking number"
          />
        </div>
        <Button type="submit" variant="secondary" isLoading={isSubmitting}>
          {isSubmitting ? "Saving…" : "Map"}
        </Button>
      </div>
    </form>
  );
}
