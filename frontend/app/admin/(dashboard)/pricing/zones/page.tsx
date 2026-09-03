"use client";

import { useEffect, useState } from "react";
import { MapPinned } from "lucide-react";
import type { RateProviderDto, ZoneDto } from "@nationwide/shared-types";
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
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ZoneDialog } from "@/components/pricing/zone-dialog";
import { ZoneCountriesDialog } from "@/components/pricing/zone-countries-dialog";

export default function PricingZonesPage() {
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
