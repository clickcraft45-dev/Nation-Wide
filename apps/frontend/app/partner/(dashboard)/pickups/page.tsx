"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PickupCard } from "@/components/partner/pickup-card";
import { cn } from "@/lib/utils/cn";

type FilterTab = "today" | "tomorrow" | "upcoming" | "all";

const NON_TERMINAL = new Set([
  "PENDING_ASSIGNMENT",
  "ASSIGNED",
  "SCHEDULED",
  "OUT_FOR_PICKUP",
  "VERIFICATION_PENDING",
]);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateHeading(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function PartnerPickupsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");

  const [pickups, setPickups] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>(dateParam ? "upcoming" : "today");
  const [search, setSearch] = useState("");

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PickupRequestDto[]>("/partner/pickup-requests")
      .then(setPickups)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load your pickups." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const grouped = useMemo(() => {
    const now = new Date();
    const today = isoDate(now);
    const tomorrowD = new Date(now);
    tomorrowD.setDate(tomorrowD.getDate() + 1);
    const tomorrow = isoDate(tomorrowD);

    const q = search.trim().toLowerCase();
    let rows = pickups.filter(
      (p) =>
        !q ||
        p.pickupContactName.toLowerCase().includes(q) ||
        p.pickupAddressLine1.toLowerCase().includes(q) ||
        p.pickupCity.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );

    if (dateParam) {
      rows = rows.filter((p) => p.pickupDate === dateParam);
    } else {
      switch (filter) {
        case "today":
          rows = rows.filter((p) => NON_TERMINAL.has(p.status) && p.pickupDate === today);
          break;
        case "tomorrow":
          rows = rows.filter((p) => NON_TERMINAL.has(p.status) && p.pickupDate === tomorrow);
          break;
        case "upcoming":
          rows = rows.filter(
            (p) =>
              NON_TERMINAL.has(p.status) &&
              p.pickupDate !== null &&
              p.pickupDate > tomorrow,
          );
          break;
        default:
        // "all" — no extra filtering
      }
    }

    const groups = new Map<string, PickupRequestDto[]>();
    for (const p of rows) {
      const key = p.pickupDate ?? "Unscheduled";
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [pickups, filter, search, dateParam]);

  const totalCount = grouped.reduce((sum, [, rows]) => sum + rows.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickups</h1>
        <p className="text-sm text-muted-foreground">Every pickup assigned to you.</p>
      </div>

      {dateParam ? (
        <button
          type="button"
          onClick={() => router.push("/partner/pickups")}
          className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Showing {formatDateHeading(dateParam)}
        </button>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["today", "Today"],
              ["tomorrow", "Tomorrow"],
              ["upcoming", "Upcoming"],
              ["all", "All"],
            ] as [FilterTab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium",
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <SearchInput
        placeholder="Search name, address, or ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search pickups"
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && totalCount === 0 && (
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" aria-hidden />}
          title="No pickups here"
          description="Nothing matches this filter right now."
        />
      )}

      {!isLoading && !error && totalCount > 0 && (
        <div className="space-y-5">
          {grouped.map(([date, rows]) => (
            <div key={date} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {date === "Unscheduled" ? "Unscheduled" : formatDateHeading(date)}
              </h2>
              <div className="space-y-2">
                {rows.map((p) => (
                  <PickupCard key={p.id} pickup={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PartnerPickupsPage() {
  return (
    <Suspense fallback={null}>
      <PartnerPickupsPageInner />
    </Suspense>
  );
}
