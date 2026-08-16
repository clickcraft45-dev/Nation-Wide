"use client";

import { useRouter } from "next/navigation";
import { MapPin, Phone, Scale } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";

function shipmentLabel(type: PickupRequestDto["shipmentType"]): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

// One pickup, one large tappable card — the primary unit of the mobile home/list screens.
// Deliberately dense but single-column: everything the partner needs to recognize a stop is
// visible without opening it, nothing requires horizontal scrolling.
//
// This is a clickable div rather than a Link because the card also embeds a real "tel:" anchor
// (tap-to-call) — nesting an <a> inside next/link's <a> would be invalid HTML.
export function PickupCard({ pickup }: { pickup: PickupRequestDto }) {
  const router = useRouter();
  const weight = pickup.verifiedWeightKg ?? pickup.estimatedWeightKg;
  const amount = pickup.verifiedPrice ?? pickup.estimatedPrice;
  const href = `/partner/pickups/${pickup.id}`;

  function openDetail() {
    router.push(href);
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
      className="cursor-pointer rounded-xl border border-border bg-card p-4 outline-none transition-colors active:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-foreground">{pickup.pickupContactName}</p>
        <div className="flex shrink-0 items-center gap-2">
          <PickupRequestStatusBadge status={pickup.status} />
          {/* Tap-to-call without opening the pickup — the partner is often mid-walk to the door. */}
          <a
            href={`tel:${pickup.pickupContactPhone}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${pickup.pickupContactName}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-bg text-primary"
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>

      <p className="mt-0.5 text-sm text-muted-foreground">
        {pickup.dropAtWarehouse
          ? "Warehouse drop-off"
          : `${pickup.pickupDate ?? "Unscheduled"} · ${pickup.pickupTimeSlot ?? "—"}`}
      </p>

      {!pickup.dropAtWarehouse && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="line-clamp-2">
            {pickup.pickupAddressLine1}, {pickup.pickupCity}
          </span>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Scale className="h-4 w-4" aria-hidden />
          {shipmentLabel(pickup.shipmentType)} · {weight}kg
        </p>
        <p className="text-lg font-semibold text-foreground">
          {pickup.currency} {Math.round(amount).toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}
