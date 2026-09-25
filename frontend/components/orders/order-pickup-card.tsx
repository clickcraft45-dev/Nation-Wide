"use client";

import Link from "next/link";
import { Truck } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN") : "—";
}

/**
 * Who collected this parcel, from where, and when each step happened.
 *
 * The pickup record already holds all of it — partner, arrival, verification, the money taken at
 * the door — but it lived one click away on the pickup request. An order being chased is chased
 * on this page, so the trail is repeated here rather than linked to.
 */
export function OrderPickupCard({ pickup }: { pickup: PickupRequestDto }) {
  const rows: { label: string; value: string }[] = [
    { label: "Picked up by", value: pickup.assignedPartnerName ?? "Not assigned yet" },
    { label: "Partner phone", value: pickup.assignedPartnerPhone ?? "—" },
    { label: "Assigned", value: when(pickup.assignedAt) },
    { label: "Arrived at pickup", value: when(pickup.arrivedAt) },
    { label: "Verified at the door", value: when(pickup.verifiedAt) },
    {
      label: "Weight at pickup",
      value:
        pickup.verifiedWeightKg != null
          ? `${pickup.verifiedWeightKg} kg (booked ${pickup.estimatedWeightKg} kg)`
          : `${pickup.estimatedWeightKg} kg as booked`,
    },
    { label: "Carrier quoted", value: pickup.rateProviderName ?? "Manual quote" },
  ];

  const address = [
    pickup.pickupAddressLine1,
    pickup.pickupAddressLine2,
    pickup.pickupCity,
    pickup.pickupState,
    pickup.pickupPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const mapsUrl =
    pickup.pickupLatitude != null && pickup.pickupLongitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${pickup.pickupLatitude},${pickup.pickupLongitude}`
      : pickup.pickupMapsUrl;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-4 w-4" aria-hidden />
          Pickup
        </CardTitle>
        <PickupRequestStatusBadge status={pickup.status} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="text-muted-foreground">
            {pickup.dropAtWarehouse ? "Dropped at the warehouse by" : "Collected from"}
          </p>
          <p className="font-medium text-foreground">
            {pickup.pickupContactName} · {pickup.pickupContactPhone}
          </p>
          <p className="text-muted-foreground">{address}</p>
          {mapsUrl && (
            <Link
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Open in Maps
            </Link>
          )}
        </div>

        {pickup.pickupInstructions && (
          <div>
            <p className="text-muted-foreground">Instructions</p>
            <p className="text-foreground">{pickup.pickupInstructions}</p>
          </div>
        )}

        {pickup.acceptanceRemarks && (
          <div>
            <p className="text-muted-foreground">Remarks at acceptance</p>
            <p className="text-foreground">{pickup.acceptanceRemarks}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
