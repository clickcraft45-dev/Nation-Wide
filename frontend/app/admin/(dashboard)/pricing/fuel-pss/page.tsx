"use client";

import { useEffect, useState } from "react";
import { Fuel } from "lucide-react";
import type { RateProviderDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RateProviderDialog } from "@/components/pricing/rate-provider-dialog";

// Fuel Charge % and PSS/kg live once per provider (RateProvider), not per rate — updating either
// here affects every shipment quoted for that provider immediately, with no duplicate values
// hiding inside individual rate records.
export default function FuelAndPssPage() {
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
      <p className="text-sm text-muted-foreground">
        Fuel Charge % applies to Base Rate only; PSS is a flat rate per kg. Both apply
        automatically to every quote for that provider — there&apos;s nothing to set per rate.
      </p>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && providers.length === 0 && (
        <EmptyState icon={<Fuel className="h-8 w-8" aria-hidden />} title="No providers yet" />
      )}

      {!isLoading && !error && providers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between">
                  <p className="text-base font-semibold text-foreground">{p.name}</p>
                  <Badge variant={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Fuel Charge</dt>
                  <dd className="text-right text-foreground">{p.fuelChargePercent}%</dd>
                  <dt className="text-muted-foreground">PSS</dt>
                  <dd className="text-right text-foreground">₹{p.pssPerKg} / kg</dd>
                  <dt className="text-muted-foreground">Last Updated</dt>
                  <dd className="text-right text-foreground">
                    {new Date(p.updatedAt).toLocaleDateString("en-IN")}
                  </dd>
                </dl>
                <RateProviderDialog
                  provider={p}
                  onSaved={() => load()}
                  trigger={
                    <Button size="sm" className="w-full">
                      Update
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
