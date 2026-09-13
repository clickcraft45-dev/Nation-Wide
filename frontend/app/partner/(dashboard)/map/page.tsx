"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPinOff } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { distanceKm } from "@/lib/google-maps";
import { PickupsMap, type LatLng, type MapPoint } from "@/components/ui/pickups-map";
import { PickupCard, isOpenRequest } from "@/components/partner/pickup-card";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";

const ACTIVE = new Set(["PENDING_ASSIGNMENT", "ASSIGNED", "SCHEDULED", "OUT_FOR_PICKUP", "VERIFICATION_PENDING"]);
const OPEN_COLOR = "#ea580c";
const MINE_COLOR = "#16a34a";
// ponytail: polling. New requests show up within this long; a WebSocket push is the upgrade if
// partners need them instantly.
const REFRESH_MS = 30_000;

export default function PartnerMapPage() {
  const [pickups, setPickups] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);

  function load() {
    apiClient
      .get<PickupRequestDto[]>("/partner/pickup-requests")
      .then((rows) => {
        setPickups(rows);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, "Failed to load pickups.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // Active pickups that have a location, nearest first once we know where the partner is.
  const located = useMemo(() => {
    const rows = pickups.filter(
      (p) => ACTIVE.has(p.status) && !p.dropAtWarehouse && p.pickupLatitude != null && p.pickupLongitude != null,
    );
    const withDistance = rows.map((p) => ({
      pickup: p,
      km: me ? distanceKm(me, { lat: p.pickupLatitude!, lng: p.pickupLongitude! }) : null,
    }));
    return withDistance.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  }, [pickups, me]);

  const points = useMemo<MapPoint[]>(
    () =>
      located.map(({ pickup: p, km }) => ({
        id: p.id,
        lat: p.pickupLatitude!,
        lng: p.pickupLongitude!,
        title: `${isOpenRequest(p) ? "New request" : "Your pickup"} · ${p.pickupContactName}`,
        subtitle: [p.pickupAddressLine1, km != null ? `${km.toFixed(1)} km away` : null].filter(Boolean).join(" · "),
        href: `/partner/pickups/${p.id}`,
        color: isOpenRequest(p) ? OPEN_COLOR : MINE_COLOR,
      })),
    [located],
  );

  const unlocated = pickups.filter(
    (p) => ACTIVE.has(p.status) && !p.dropAtWarehouse && (p.pickupLatitude == null || p.pickupLongitude == null),
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickups Near You</h1>
        <p className="text-sm text-muted-foreground">Your live location and every pickup point around you.</p>
      </div>

      <PickupsMap points={points} trackMe onMyLocation={setMe} className="h-[55vh] min-h-80" />

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend color="#2563eb" label="You" />
        <Legend color={OPEN_COLOR} label="New request" />
        <Legend color={MINE_COLOR} label="Your pickup" />
      </div>

      {isLoading && <Skeleton className="h-24 w-full" />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && located.length === 0 && (
        <EmptyState
          icon={<MapPinOff className="h-8 w-8" aria-hidden />}
          title="No pickups on the map"
          description="New requests with a pinned location will appear here."
        />
      )}

      {!isLoading && !error && located.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            {me ? "Nearest first" : "Pickups"}{" "}
            <span className="font-normal text-muted-foreground">({located.length})</span>
          </h2>
          {located.map(({ pickup, km }) => (
            <div key={pickup.id} className="space-y-1">
              {km != null && <p className="px-1 text-xs font-medium text-muted-foreground">{km.toFixed(1)} km away</p>}
              <PickupCard pickup={pickup} onClaimFailed={load} />
            </div>
          ))}
        </div>
      )}

      {unlocated > 0 && (
        <p className="text-xs text-muted-foreground">
          {unlocated} active pickup(s) have no map pin — find them under Scheduled Pickups.
        </p>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full border-2 border-white shadow" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
