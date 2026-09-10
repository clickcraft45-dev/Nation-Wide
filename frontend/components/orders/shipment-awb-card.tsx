"use client";

import { useState } from "react";
import type { ShipmentSummaryDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
import { AURORA_THEMES, AuroraCard, type AuroraTheme } from "@/components/ui/aurora-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

/**
 * A shipment rendered as a payment card.
 *
 * The AWB is the number a customer types into the tracking box, so it is treated the way a card
 * number is treated on a bank's cards screen: the largest thing on the panel, grouped in fours
 * so it can be read aloud without losing your place, and one tap to copy. An unmapped shipment
 * shows the same panel with the number slot empty, which is what makes "this one still needs an
 * AWB" legible at a glance rather than a field you have to go looking for.
 */
export function ShipmentAwbCard({
  shipment,
  providers,
  customerName,
  destination,
  onMapped,
}: {
  shipment: ShipmentSummaryDto;
  providers: ShippingProviderDto[];
  customerName: string | null;
  destination: string | null;
  onMapped: () => void;
}) {
  const [providerId, setProviderId] = useState(shipment.providerId);
  const [value, setValue] = useState(shipment.externalTrackingNumber ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ponytail: per-view only; persist to localStorage if admins want their pick remembered.
  const [theme, setTheme] = useState<AuroraTheme>("crimson");
  const { showToast } = useToast();

  const isMapped = Boolean(shipment.externalTrackingNumber);
  const provider = providers.find((p) => p.id === shipment.providerId);

  async function copyAwb() {
    if (!shipment.externalTrackingNumber) return;
    try {
      await navigator.clipboard.writeText(shipment.externalTrackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast({ variant: "error", title: "Couldn't copy the AWB." });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const awb = value.trim();
    if (!awb) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.post(
        `/admin/shipments/${shipment.internalTrackingNumber}/external-tracking-number`,
        { providerId, externalTrackingNumber: awb },
      );
      showToast({ variant: "success", title: `AWB ${awb} mapped` });
      onMapped();
    } catch (err) {
      // The server rejects a duplicate AWB with a 409 naming the other shipment — that reason is
      // the whole value of the failure, so it is shown rather than a generic message.
      setError(errorMessage(err, "Couldn't map that AWB. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <AuroraCard
        theme={theme}
        carrier={provider?.name ?? "Unassigned carrier"}
        reference={shipment.internalTrackingNumber}
        status={<TrackingStatusBadge status={shipment.currentStatus} />}
        customerName={customerName}
        destination={destination}
        awb={shipment.externalTrackingNumber}
        copied={copied}
        onCopy={copyAwb}
      />

      <div className="flex items-center gap-2" role="radiogroup" aria-label="Card style">
        {(Object.keys(AURORA_THEMES) as AuroraTheme[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            title={AURORA_THEMES[id].name}
            onClick={() => setTheme(id)}
            className={cn(
              "h-6 w-6 rounded-full border border-white/20 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              theme === id && "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background",
            )}
            style={{ background: AURORA_THEMES[id].background }}
          />
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <NativeSelect
          className="sm:w-44"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          aria-label="Carrier for this AWB"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <Input
          className="flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter the carrier AWB"
          aria-label="AWB / tracking number"
        />
        <Button type="submit" variant="secondary" isLoading={isSaving} disabled={!value.trim()}>
          {isMapped ? "Update AWB" : "Map AWB"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
