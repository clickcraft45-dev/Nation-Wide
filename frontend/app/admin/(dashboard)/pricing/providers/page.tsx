"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tag } from "lucide-react";
import type { RateProviderDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RateProviderDialog } from "@/components/pricing/rate-provider-dialog";

export default function PricingProvidersPage() {
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Pick a provider to manage its countries, weight categories, and rates.
        </p>
        <RateProviderDialog onSaved={() => load()} trigger={<Button size="sm">New provider</Button>} />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && providers.length === 0 && (
        <EmptyState icon={<Tag className="h-8 w-8" aria-hidden />} title="No providers yet" />
      )}

      {!isLoading && !error && providers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                    <p className="text-base font-semibold text-foreground">{p.name}</p>
                  </div>
                  <Badge variant={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Fuel Charge</dt>
                  <dd className="text-right text-foreground">{p.fuelChargePercent}%</dd>
                  <dt className="text-muted-foreground">PSS</dt>
                  <dd className="text-right text-foreground">₹{p.pssPerKg} / kg</dd>
                  <dt className="text-muted-foreground">Active Countries</dt>
                  <dd className="text-right text-foreground">{p.activeCountryCount}</dd>
                  <dt className="text-muted-foreground">Last Updated</dt>
                  <dd className="text-right text-foreground">
                    {new Date(p.updatedAt).toLocaleDateString("en-IN")}
                  </dd>
                </dl>
                <Link href={`/admin/pricing/providers/${p.id}`} className="block">
                  <Button size="sm" className="w-full">
                    Manage
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
