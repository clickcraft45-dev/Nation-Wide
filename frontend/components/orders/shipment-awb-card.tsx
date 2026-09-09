"use client";

import { useState } from "react";
import { Check, Copy, CreditCard } from "lucide-react";
import type { ShipmentSummaryDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
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

/** 7788123456 -> "7788 1234 56". Grouping only; the value itself is never altered. */
function groupForReading(value: string): string {
  return value.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

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
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6",
          "bg-[linear-gradient(135deg,#3d0810_0%,#7f1020_55%,#a5182c_100%)]",
        )}
      >
        {/* Light sweep across the panel — the sheen a physical card has under a desk lamp. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(120% 80% at 15% 0%, rgba(255,255,255,0.28) 0%, transparent 55%)",
          }}
          aria-hidden
        />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              {provider?.name ?? "Unassigned carrier"}
            </p>
            <p className="mt-1 font-mono text-xs text-white/80">
              {shipment.internalTrackingNumber}
            </p>
          </div>
          <TrackingStatusBadge status={shipment.currentStatus} />
        </div>

        {/* The EMV chip. Purely decorative, hence aria-hidden. */}
        <div
          className="relative mt-5 h-8 w-11 rounded-md bg-[linear-gradient(135deg,#e8c877,#b8933f)] shadow-inner"
          aria-hidden
        >
          <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-black/25" />
          <div className="absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2 bg-black/25" />
        </div>

        <div className="relative mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
            AWB / tracking number
          </p>
          {isMapped ? (
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-xl font-semibold tracking-wider sm:text-2xl">
                {groupForReading(shipment.externalTrackingNumber!)}
              </p>
              <button
                type="button"
                onClick={copyAwb}
                className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                aria-label={copied ? "AWB copied" : "Copy AWB"}
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          ) : (
            <p className="mt-1 font-mono text-xl tracking-[0.35em] text-white/35 sm:text-2xl">
              •••• •••• ••••
            </p>
          )}
        </div>

        <div className="relative mt-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Customer
            </p>
            <p className="truncate text-sm font-medium">{customerName ?? "—"}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Destination
            </p>
            <p className="truncate text-sm font-medium">{destination ?? "—"}</p>
          </div>
          <CreditCard className="h-6 w-6 shrink-0 text-white/40" aria-hidden />
        </div>
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
