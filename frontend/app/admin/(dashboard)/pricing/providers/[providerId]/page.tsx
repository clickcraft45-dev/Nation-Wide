"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Globe, History } from "lucide-react";
import type { ProviderCountryDto, RateProviderDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { RateProviderDialog } from "@/components/pricing/rate-provider-dialog";
import { RateHistoryDialog } from "@/components/pricing/rate-history-dialog";

export default function ProviderDetailPage() {
  const params = useParams<{ providerId: string }>();
  const [provider, setProvider] = useState<RateProviderDto | null>(null);
  const [countries, setCountries] = useState<ProviderCountryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<RateProviderDto>(`/admin/rate-providers/${params.providerId}`),
      apiClient.get<ProviderCountryDto[]>(`/admin/rate-providers/${params.providerId}/countries`),
    ])
      .then(([p, c]) => {
        setProvider(p);
        setCountries(c);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? "Provider not found."
            : "Failed to load this provider.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.providerId]);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/admin/pricing/providers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to providers
      </Link>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && provider && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{provider.name}</h2>
              <p className="font-mono text-xs text-muted-foreground">{provider.code}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={provider.isActive ? "success" : "neutral"}>
                {provider.isActive ? "Active" : "Inactive"}
              </Badge>
              <RateProviderDialog
                provider={provider}
                onSaved={() => load()}
                trigger={<Button variant="secondary" size="sm">Edit configuration</Button>}
              />
              <RateHistoryDialog
                rateId={provider.id}
                entity="RateProvider"
                title="Provider configuration history"
                trigger={
                  <Button variant="ghost" size="sm">
                    <History className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Recent updates
                  </Button>
                }
              />
            </div>
          </div>

          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Fuel Charge</p>
                <p className="text-lg font-semibold text-foreground">{provider.fuelChargePercent}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PSS</p>
                <p className="text-lg font-semibold text-foreground">₹{provider.pssPerKg} / kg</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Countries</p>
                <p className="text-lg font-semibold text-foreground">{provider.activeCountryCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-lg font-semibold text-foreground">
                  {new Date(provider.updatedAt).toLocaleDateString("en-IN")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Countries configured for this provider</CardTitle>
            </CardHeader>
            <CardContent>
              {countries.length === 0 ? (
                <EmptyState
                  icon={<Globe className="h-8 w-8" aria-hidden />}
                  title="No countries configured yet"
                  description="Assign a country to a zone under this provider to start pricing it."
                  action={
                    <Link href="/admin/pricing/zones">
                      <Button size="sm">Go to Zones</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="divide-y divide-border">
                  {countries.map((c) => (
                    <div key={c.countryId} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.countryName}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.zoneName} · {c.weightSlabCount} weight{" "}
                          {c.weightSlabCount === 1 ? "category" : "categories"} ·{" "}
                          {c.availableShipmentTypes.length === 0
                            ? "no services configured"
                            : c.availableShipmentTypes.join(", ").toLowerCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.isActive ? "success" : "neutral"}>
                          {c.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Link href={`/admin/pricing/providers/${provider.id}/countries/${c.countryId}`}>
                          <Button variant="secondary" size="sm">
                            Manage
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
