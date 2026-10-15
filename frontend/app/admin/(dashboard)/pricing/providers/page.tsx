"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Tag, Upload } from "lucide-react";
import type { RateProviderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RateProviderDialog } from "@/components/pricing/rate-provider-dialog";
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download-blob";
import { cn } from "@/lib/utils/cn";
import { BackLink } from "@/components/ui/back-link";

export default function PricingProvidersPage() {
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const { showToast } = useToast();

  // Each provider has its own zones, countries and rates, so its sheet goes in and out on its own.
  async function exportSheet(p: RateProviderDto) {
    setExporting(p.id);
    try {
      const { blob, headers } = await apiClient.getBlob(`/admin/pricing/providers/${p.id}/rate-sheet/export`);
      const name =
        /filename="([^"]+)"/.exec(headers.get("Content-Disposition") ?? "")?.[1] ??
        `${p.code.toLowerCase()}-rates.xlsx`;
      downloadBlob(blob, name);
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, `Couldn't export ${p.name}'s rates.`) });
    } finally {
      setExporting(null);
    }
  }

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<RateProviderDto[]>("/admin/rate-providers")
      .then(setProviders)
      .catch((err) => {
        setError(errorMessage(err, "Failed to load providers."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-4">
      <BackLink href="/admin/pricing/dashboard">Back to pricing</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pick a provider to manage its countries, weight categories, and rates.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <RateProviderDialog onSaved={() => load()} trigger={<Button size="sm">New provider</Button>} />
        </div>
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
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void exportSheet(p)}
                    isLoading={exporting === p.id}
                    aria-label={`Export ${p.name} rates to Excel`}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Export
                  </Button>
                  <Link
                    href={`/admin/pricing/rate-sheets?provider=${p.id}`}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                    aria-label={`Import a rate sheet for ${p.name}`}
                  >
                    <Upload className="h-4 w-4" aria-hidden />
                    Import
                  </Link>
                </div>
                <Link href={`/admin/pricing/providers/${p.id}`} className={cn(buttonVariants({ size: "sm" }), "w-full")}>
                  Manage
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
