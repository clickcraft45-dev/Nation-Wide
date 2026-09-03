"use client";

import { useEffect, useState } from "react";
import { FileClock } from "lucide-react";
import type { AuditLogEntryDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";

const WEIGHT_SLAB_FIELD_LABELS: Record<string, string> = {
  weightFromKg: "Weight from",
  weightToKg: "Weight to",
  baseRate: "Fixed Rate",
  gstPercent: "GST %",
  nationwideCut: "NationWide Margin",
};

function describeChange(entry: AuditLogEntryDto): string {
  if (entry.entity !== "WeightSlab" || typeof entry.after !== "object" || entry.after === null) {
    return `${JSON.stringify(entry.before ?? {})} → ${JSON.stringify(entry.after ?? {})}`;
  }
  const before = (entry.before ?? {}) as Record<string, number>;
  const after = entry.after as Record<string, number>;
  const changes = Object.keys(WEIGHT_SLAB_FIELD_LABELS)
    .filter((key) => before[key] !== undefined && after[key] !== undefined && before[key] !== after[key])
    .map((key) => `${WEIGHT_SLAB_FIELD_LABELS[key]}: ${before[key]} → ${after[key]}`);
  if (changes.length === 0 && "isActive" in after) {
    return after.isActive ? "Activated" : "Deactivated";
  }
  return changes.length > 0 ? changes.join(" · ") : "No value change";
}

export default function RateHistoryPage() {
  const [entries, setEntries] = useState<AuditLogEntryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("entities", "WeightSlab,RateProvider");
    params.set("limit", "100");
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    apiClient
      .get<AuditLogEntryDto[]>(`/admin/audit-logs?${params.toString()}`)
      .then(setEntries)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load rate history." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching on filter change is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <SearchInput
            placeholder="Admin email or action"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search rate history"
          />
        </div>
        <div className="space-y-1.5 sm:w-52">
          <Label htmlFor="history-from">From</Label>
          <DateField
            id="history-from"
            title="From"
            subtitle="Earliest change to show"
            max={dateTo || undefined}
            value={dateFrom}
            onChange={setDateFrom}
          />
        </div>
        <div className="space-y-1.5 sm:w-52">
          <Label htmlFor="history-to">To</Label>
          <DateField
            id="history-to"
            title="To"
            subtitle="Latest change to show"
            min={dateFrom || undefined}
            value={dateTo}
            onChange={setDateTo}
            align="end"
          />
        </div>
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && entries.length === 0 && (
        <EmptyState
          icon={<FileClock className="h-8 w-8" aria-hidden />}
          title="No changes recorded yet"
          description="Rate and provider configuration changes will show up here."
        />
      )}

      {!isLoading && !error && entries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Changed By</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.rateProviderName ?? "—"}</TableCell>
                <TableCell>{entry.zoneName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString("en-IN")}
                </TableCell>
                <TableCell>{entry.actorEmail}</TableCell>
                <TableCell className="max-w-md text-xs">{describeChange(entry)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{entry.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
