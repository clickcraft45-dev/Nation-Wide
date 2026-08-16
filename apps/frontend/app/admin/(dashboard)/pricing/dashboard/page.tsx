"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Tag,
  Globe,
  MapPinned,
  Receipt,
  Clock,
  FileClock,
  FileText,
  Search,
} from "lucide-react";
import type {
  PricingDashboardSummaryDto,
  PricingSearchResultDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PricingQuickActions } from "@/components/pricing/pricing-quick-actions";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page-state";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PricingDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<PricingDashboardSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [results, setResults] = useState<PricingSearchResultDto[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PricingDashboardSummaryDto>("/admin/pricing/dashboard-summary")
      .then(setSummary)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load the pricing summary." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    // Live search-as-you-type is a one-shot lookup per keystroke (debounced), not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSearching(true);
    apiClient
      .get<PricingSearchResultDto[]>(
        `/admin/pricing/search?q=${encodeURIComponent(debouncedQuery.trim())}`,
      )
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setIsSearching(false));
  }, [debouncedQuery]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a provider or country, e.g. “USA”…"
          className="pl-9"
          aria-label="Search pricing"
        />
        {query.trim() && (
          <Card className="absolute z-10 mt-1 w-full overflow-hidden p-0">
            {isSearching && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
            )}
            {!isSearching && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
            )}
            {!isSearching &&
              results.map((r) => (
                <button
                  key={`${r.rateProviderId}-${r.countryId}`}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() =>
                    router.push(
                      `/admin/pricing/providers/${r.rateProviderId}/countries/${r.countryId}`,
                    )
                  }
                >
                  <span className="font-medium text-foreground">{r.rateProviderName}</span>
                  <span className="text-muted-foreground">{r.countryName}</span>
                </button>
              ))}
          </Card>
        )}
      </div>

      <PricingQuickActions />

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            title="Total Providers"
            value={summary?.totalProviders ?? 0}
            icon={Tag}
            href="/admin/pricing/providers"
            isLoading={isLoading}
          />
          <KpiCard
            title="Active Countries"
            value={summary?.activeCountries ?? 0}
            icon={Globe}
            href="/admin/pricing/countries"
            isLoading={isLoading}
          />
          <KpiCard
            title="Total Zones"
            value={summary?.totalZones ?? 0}
            icon={MapPinned}
            href="/admin/pricing/zones"
            isLoading={isLoading}
          />
          <KpiCard
            title="Total Rate Cards"
            value={summary?.totalRateCards ?? 0}
            icon={Receipt}
            href="/admin/pricing/providers"
            isLoading={isLoading}
          />
          <KpiCard
            title="Last Updated"
            value={formatDateTime(summary?.lastUpdatedAt ?? null)}
            icon={Clock}
            href="/admin/pricing/rate-history"
            isLoading={isLoading}
          />
          <KpiCard
            title="Pending Changes"
            value={summary?.pendingChangesCount ?? 0}
            icon={FileClock}
            href="/admin/pricing/rate-history"
            isLoading={isLoading}
            hint="Rate edits not yet in a published PDF"
          />
          <KpiCard
            title="Last Generated PDF"
            value={summary?.lastGeneratedPdf?.rateProviderName ?? "None yet"}
            icon={FileText}
            href="/admin/pricing/pdf-generator"
            isLoading={isLoading}
            hint={summary?.lastGeneratedPdf ? formatDateTime(summary.lastGeneratedPdf.createdAt) : undefined}
          />
        </div>
      )}
    </div>
  );
}
