"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, UserRound } from "lucide-react";
import type { PickupPartnerDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { distanceKm } from "@/lib/google-maps";
import { cn } from "@/lib/utils/cn";

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * Staff choosing who collects a pickup. Each partner shows where their phone last reported from
 * (once per app session — not live tracking) and, when the pickup has a pin, how far that is, so
 * the nearest is at the top.
 */
export function PartnerPicker({
  value,
  onChange,
  pickup,
}: {
  value: string | null;
  onChange: (partnerId: string) => void;
  pickup: { lat: number; lng: number } | null;
}) {
  const [partners, setPartners] = useState<PickupPartnerDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiClient
      .get<PickupPartnerDto[]>("/admin/pickup-partners")
      .then((all) => setPartners(all.filter((p) => p.isActive)))
      .catch(() => setFailed(true));
  }, []);

  const rows = useMemo(() => {
    return (partners ?? [])
      .map((p) => ({
        partner: p,
        km:
          pickup && p.lastLatitude != null && p.lastLongitude != null
            ? distanceKm(pickup, { lat: p.lastLatitude, lng: p.lastLongitude })
            : null,
      }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }, [partners, pickup]);

  if (failed) return <p className="text-sm text-danger">Couldn&apos;t load pickup partners.</p>;
  if (!partners) return <p className="text-sm text-muted-foreground">Loading partners…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No active pickup partners.</p>;

  return (
    <div role="radiogroup" aria-label="Pickup partner" className="max-h-80 space-y-1.5 overflow-y-auto">
      {rows.map(({ partner, km }) => (
        <button
          key={partner.id}
          type="button"
          role="radio"
          aria-checked={value === partner.id}
          onClick={() => onChange(partner.id)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
            value === partner.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
          )}
        >
          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-foreground">{partner.name ?? partner.email}</span>
            <span className="block text-xs text-muted-foreground">
              {partner.phone ?? "No phone"}
              {partner.locationUpdatedAt
                ? ` · location ${ago(partner.locationUpdatedAt)}`
                : " · location not shared yet"}
            </span>
          </span>
          {km !== null && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {km < 10 ? km.toFixed(1) : Math.round(km)} km
            </span>
          )}
          {partner.lastLatitude != null && partner.lastLongitude != null && (
            <a
              href={`https://www.google.com/maps?q=${partner.lastLatitude},${partner.lastLongitude}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-xs text-primary hover:underline"
            >
              Map
            </a>
          )}
        </button>
      ))}
    </div>
  );
}
