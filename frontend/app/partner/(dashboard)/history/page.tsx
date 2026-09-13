"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import type { PickupRequestDto, PickupRequestStatusCode } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { PickupCard } from "@/components/partner/pickup-card";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";

const CLOSED: PickupRequestStatusCode[] = ["COMPLETED", "REJECTED", "CANCELLED"];

type Filter = "ALL" | PickupRequestStatusCode;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

function monthHeading(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

// Every pickup this partner has finished — completed, rejected or cancelled — newest first. The
// same endpoint as the run sheet; the closed ones are simply what the run sheet leaves out.
export default function PartnerHistoryPage() {
  const [pickups, setPickups] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PickupRequestDto[]>("/partner/pickup-requests")
      .then(setPickups)
      .catch((err) => setError(errorMessage(err, "Failed to load your pickup history.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const closed = useMemo(
    () =>
      pickups
        .filter((p) => CLOSED.includes(p.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [pickups],
  );

  const completed = closed.filter((p) => p.status === "COMPLETED");
  const earned = completed.reduce((sum, p) => sum + (p.collectedAmount ?? 0), 0);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = closed.filter(
      (p) =>
        (filter === "ALL" || p.status === filter) &&
        (!q ||
          p.pickupContactName.toLowerCase().includes(q) ||
          p.pickupCity.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)),
    );
    const byMonth = new Map<string, PickupRequestDto[]>();
    for (const p of rows) {
      const key = monthHeading(p.updatedAt);
      byMonth.set(key, [...(byMonth.get(key) ?? []), p]);
    }
    return [...byMonth.entries()];
  }, [closed, filter, search]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickup History</h1>
        <p className="text-sm text-muted-foreground">Every pickup you have closed.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Completed" value={isLoading ? undefined : completed.length} />
        <Stat label="Rejected" value={isLoading ? undefined : closed.filter((p) => p.status === "REJECTED").length} />
        <Stat label="Collected" value={isLoading ? undefined : formatInr(earned)} />
      </div>

      <SegmentedControl ariaLabel="Filter history" options={FILTERS} value={filter} onChange={setFilter} />

      <SearchInput
        placeholder="Search name, city, or ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search pickup history"
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && groups.length === 0 && (
        <EmptyState
          icon={<History className="h-8 w-8" aria-hidden />}
          title="No pickups here yet"
          description="Pickups you complete or reject will show up here."
        />
      )}

      {!isLoading &&
        !error &&
        groups.map(([month, rows]) => (
          <div key={month} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {month} <span className="font-normal">({rows.length})</span>
            </h2>
            {rows.map((p) => (
              <PickupCard key={p.id} pickup={p} />
            ))}
          </div>
        ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="glass rounded-2xl px-3 py-3 text-center">
      {value === undefined ? (
        <Skeleton className="mx-auto h-6 w-10" />
      ) : (
        <p className="text-lg font-semibold text-foreground">{value}</p>
      )}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
