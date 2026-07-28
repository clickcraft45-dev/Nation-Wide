"use client";

import { useEffect, useMemo, useState } from "react";
import { Tag, Globe, Receipt, MapPinned } from "lucide-react";
import type { CountryDto, RateDto, RateProviderDto, ZoneDto } from "@nationwide/shared-types";
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
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { RateProviderDialog } from "@/components/pricing/rate-provider-dialog";
import { CountryDialog } from "@/components/pricing/country-dialog";
import { ZoneDialog } from "@/components/pricing/zone-dialog";
import { ZoneCountriesDialog } from "@/components/pricing/zone-countries-dialog";
import { RateFormDialog } from "@/components/pricing/rate-form-dialog";
import { RateHistoryDialog } from "@/components/pricing/rate-history-dialog";
import { cn } from "@/lib/utils/cn";

const SHIPMENT_TYPE_LABELS: Record<string, string> = {
  DOCUMENT: "Document",
  PARCEL: "Parcel",
  PACKAGE: "Package",
};

// A fixed palette assigned by each provider's position in the full provider list (sorted by id
// for a stable order), so every provider gets its own distinct color — a hash-based assignment
// can't guarantee that two providers never land in the same bucket, but an index into a palette
// larger than the provider count can.
const PROVIDER_COLOR_PALETTE = [
  "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
  "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
  "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
  "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
];

function buildProviderColorMap(providers: RateProviderDto[]): Map<string, string> {
  const sorted = [...providers].sort((a, b) => a.id.localeCompare(b.id));
  return new Map(
    sorted.map((p, index) => [p.id, PROVIDER_COLOR_PALETTE[index % PROVIDER_COLOR_PALETTE.length]]),
  );
}

type Tab = "rates" | "zones" | "providers" | "countries";

export default function AdminPricingPage() {
  const [tab, setTab] = useState<Tab>("rates");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pricing Management</h1>
        <p className="text-sm text-muted-foreground">
          Rates, providers, and destination countries the pricing engine uses to quote customers.
          Changes here take effect immediately — no deployment required.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            { key: "rates", label: "Rates" },
            { key: "zones", label: "Zones" },
            { key: "providers", label: "Providers" },
            { key: "countries", label: "Countries" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rates" && <RatesTab />}
      {tab === "zones" && <ZonesTab />}
      {tab === "providers" && <ProvidersTab />}
      {tab === "countries" && <CountriesTab />}
    </div>
  );
}

function RatesTab() {
  const [rates, setRates] = useState<RateDto[]>([]);
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState("");
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (providerFilter) params.set("rateProviderId", providerFilter);
    if (shipmentTypeFilter) params.set("shipmentType", shipmentTypeFilter);
    const query = params.toString();

    Promise.all([
      apiClient.get<RateDto[]>(`/admin/rates${query ? `?${query}` : ""}`),
      apiClient.get<RateProviderDto[]>("/admin/rate-providers"),
    ])
      .then(([r, p]) => {
        setRates(r);
        setProviders(p);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load rates." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching on filter change is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, providerFilter, shipmentTypeFilter]);

  const providerColors = useMemo(() => buildProviderColorMap(providers), [providers]);

  async function toggleActive(rate: RateDto) {
    try {
      await apiClient.patch(`/admin/rates/${rate.id}/active`, { isActive: !rate.isActive });
      showToast({
        variant: "success",
        title: rate.isActive ? "Rate deactivated" : "Rate activated",
      });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't update the rate. Please try again." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="sm:w-64">
            <SearchInput
              placeholder="Search by provider or zone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search rates"
            />
          </div>
          <NativeSelect
            className="sm:w-44"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            aria-label="Filter by provider"
          >
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            className="sm:w-40"
            value={shipmentTypeFilter}
            onChange={(e) => setShipmentTypeFilter(e.target.value)}
            aria-label="Filter by shipment type"
          >
            <option value="">All types</option>
            {Object.entries(SHIPMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <RateFormDialog onSaved={() => load()} trigger={<Button size="sm">+ Add New Rate</Button>} />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && rates.length === 0 && (
        <EmptyState
          icon={<Receipt className="h-8 w-8" aria-hidden />}
          title="No rates yet"
          description="Add one to start pricing quotes automatically."
        />
      )}
      {!isLoading && !error && rates.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Base Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((rate) => (
              <TableRow key={rate.id}>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      providerColors.get(rate.rateProviderId) ?? "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {rate.rateProviderName}
                  </span>
                </TableCell>
                <TableCell>{rate.zoneName}</TableCell>
                <TableCell>{SHIPMENT_TYPE_LABELS[rate.shipmentType] ?? rate.shipmentType}</TableCell>
                <TableCell>
                  {rate.weightFromKg === rate.weightToKg
                    ? `${rate.weightFromKg}kg`
                    : `${rate.weightFromKg}-${rate.weightToKg}kg`}
                </TableCell>
                <TableCell>
                  {rate.currency} {rate.baseRate.toLocaleString("en-IN")}
                </TableCell>
                <TableCell>
                  <Badge variant={rate.isActive ? "success" : "neutral"}>
                    {rate.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <RateFormDialog
                      rate={rate}
                      onSaved={() => load()}
                      trigger={
                        <Button variant="secondary" size="sm">
                          Edit
                        </Button>
                      }
                    />
                    <Button variant="secondary" size="sm" onClick={() => toggleActive(rate)}>
                      {rate.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <RateHistoryDialog
                      rateId={rate.id}
                      trigger={
                        <Button variant="ghost" size="sm">
                          History
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ZonesTab() {
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [providerId, setProviderId] = useState("");
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<RateProviderDto[]>("/admin/rate-providers")
      .then((p) => {
        setProviders(p);
        if (p.length > 0) setProviderId(p[0].id);
      })
      .catch(() => {});
  }, []);

  function load() {
    if (!providerId) return;
    setIsLoading(true);
    setError(null);
    apiClient
      .get<ZoneDto[]>(`/admin/zones?rateProviderId=${providerId}`)
      .then(setZones)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load zones." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching when the selected provider changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <NativeSelect
          className="sm:w-56"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          aria-label="Provider"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        {providerId && (
          <ZoneDialog
            rateProviderId={providerId}
            onSaved={() => load()}
            trigger={<Button size="sm">+ New Zone</Button>}
          />
        )}
      </div>

      {isLoading && <TableSkeleton columns={3} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && zones.length === 0 && (
        <EmptyState
          icon={<MapPinned className="h-8 w-8" aria-hidden />}
          title="No zones yet"
          description="Create a zone to group the countries this provider prices identically."
        />
      )}
      {!isLoading && !error && zones.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead>Countries</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zones.map((zone) => (
              <TableRow key={zone.id}>
                <TableCell className="font-medium">{zone.name}</TableCell>
                <TableCell>{zone.countryCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <ZoneCountriesDialog
                      zone={zone}
                      onMembershipChanged={load}
                      trigger={
                        <Button variant="secondary" size="sm">
                          Manage countries
                        </Button>
                      }
                    />
                    <ZoneDialog
                      rateProviderId={zone.rateProviderId}
                      zone={zone}
                      onSaved={() => load()}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Rename
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ProvidersTab() {
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<RateProviderDto[]>("/admin/rate-providers")
      .then(setProviders)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load providers." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RateProviderDialog
          onSaved={() => load()}
          trigger={<Button size="sm">New provider</Button>}
        />
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && providers.length === 0 && (
        <EmptyState icon={<Tag className="h-8 w-8" aria-hidden />} title="No providers yet" />
      )}
      {!isLoading && !error && providers.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.code}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RateProviderDialog
                    provider={p}
                    onSaved={() => load()}
                    trigger={
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function CountriesTab() {
  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<CountryDto[]>("/admin/countries")
      .then(setCountries)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load countries." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CountryDialog onSaved={() => load()} trigger={<Button size="sm">New country</Button>} />
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && countries.length === 0 && (
        <EmptyState icon={<Globe className="h-8 w-8" aria-hidden />} title="No countries yet" />
      )}
      {!isLoading && !error && countries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant={c.isActive ? "success" : "neutral"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <CountryDialog
                    country={c}
                    onSaved={() => load()}
                    trigger={
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
