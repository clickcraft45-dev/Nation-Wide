"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, MapPin, Navigation, Phone, Scale } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

function shipmentLabel(type: PickupRequestDto["shipmentType"]): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

/** A broadcast request no partner has taken yet — any partner may accept it. */
export function isOpenRequest(pickup: PickupRequestDto): boolean {
  return pickup.status === "PENDING_ASSIGNMENT" && pickup.assignedPartnerId === null;
}

/**
 * The step still owed on a pickup the partner already started at the door and then left without
 * finishing — the status badge alone ("OUT FOR PICKUP") doesn't say what's left to do. Null once
 * the pickup is finished, or before it was ever started.
 */
export function pendingStep(pickup: PickupRequestDto): string | null {
  if (pickup.arrivedAt === null) return null;
  if (pickup.status === "COMPLETED" || pickup.status === "CANCELLED" || pickup.status === "REJECTED") {
    return null;
  }
  if (pickup.verifiedAt === null) return "Verification pending";
  if (pickup.paymentCollectedAt === null) return "Payment pending";
  return "Acceptance pending";
}

/**
 * Google Maps directions to the pickup — to the pin the customer dropped when there is one (that is
 * the actual door), and to the typed address otherwise.
 */
export function mapsUrl(pickup: PickupRequestDto): string {
  if (pickup.pickupLatitude != null && pickup.pickupLongitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${pickup.pickupLatitude},${pickup.pickupLongitude}`;
  }
  const address = [
    pickup.pickupAddressLine1,
    pickup.pickupAddressLine2,
    pickup.pickupCity,
    pickup.pickupState,
    pickup.pickupPostalCode,
  ]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** Claims an open request; resolves to the updated pickup, or null when someone else got it first. */
export function useClaimPickup() {
  const { showToast } = useToast();
  const [isClaiming, setIsClaiming] = useState(false);

  async function claim(id: string): Promise<PickupRequestDto | null> {
    setIsClaiming(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(`/partner/pickup-requests/${id}/claim`, {});
      showToast({ variant: "success", title: "Pickup accepted — the customer has been notified" });
      return updated;
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't accept this pickup.") });
      return null;
    } finally {
      setIsClaiming(false);
    }
  }

  return { claim, isClaiming };
}

// One pickup, one large tappable card — the primary unit of the mobile home/list screens.
// Deliberately dense but single-column: everything the partner needs to recognize a stop is
// visible without opening it, nothing requires horizontal scrolling.
//
// This is a clickable div rather than a Link because the card also embeds real anchors
// (tap-to-call, directions) — nesting an <a> inside next/link's <a> would be invalid HTML.
export function PickupCard({ pickup, onClaimFailed }: { pickup: PickupRequestDto; onClaimFailed?: () => void }) {
  const router = useRouter();
  const { claim, isClaiming } = useClaimPickup();
  const weight = pickup.verifiedWeightKg ?? pickup.estimatedWeightKg;
  const amount = pickup.verifiedPrice ?? pickup.estimatedPrice;
  const href = `/partner/pickups/${pickup.id}`;
  const open = isOpenRequest(pickup);
  const pending = pendingStep(pickup);

  function openDetail() {
    router.push(href);
  }

  const iconLink =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-bg text-primary";

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
      className="glass glass-interactive cursor-pointer rounded-2xl p-4 outline-none active:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-foreground">{pickup.pickupContactName}</p>
        <div className="flex shrink-0 items-center gap-2">
          <PickupRequestStatusBadge status={pickup.status} />
          {!pickup.dropAtWarehouse && (
            <a
              href={mapsUrl(pickup)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Directions to ${pickup.pickupContactName}`}
              className={iconLink}
            >
              <Navigation className="h-4 w-4" aria-hidden />
            </a>
          )}
          {/* Tap-to-call without opening the pickup — the partner is often mid-walk to the door. */}
          <a
            href={`tel:${pickup.pickupContactPhone}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${pickup.pickupContactName}`}
            className={iconLink}
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>

      {pending && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {pending} — tap to resume
        </p>
      )}

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

      {open && (
        <Button
          size="lg"
          className="mt-3 w-full"
          isLoading={isClaiming}
          onClick={async (e) => {
            e.stopPropagation();
            const updated = await claim(pickup.id);
            if (updated) router.push(href);
            else onClaimFailed?.();
          }}
        >
          Accept Pickup
        </Button>
      )}
    </div>
  );
}
