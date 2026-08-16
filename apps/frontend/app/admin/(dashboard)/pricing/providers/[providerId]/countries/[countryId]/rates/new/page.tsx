"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { CountryDetailDto, RateProviderDto, ShipmentTypeCode } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { RateEditorForm } from "@/components/pricing/rate-editor-form";

export default function NewRatePage() {
  const params = useParams<{ providerId: string; countryId: string }>();
  const searchParams = useSearchParams();
  const shipmentType = (searchParams.get("shipmentType") as ShipmentTypeCode | null) ?? "PACKAGE";

  const [provider, setProvider] = useState<RateProviderDto | null>(null);
  const [country, setCountry] = useState<CountryDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<RateProviderDto>(`/admin/rate-providers/${params.providerId}`),
      apiClient.get<CountryDetailDto>(
        `/admin/rate-providers/${params.providerId}/countries/${params.countryId}`,
      ),
    ])
      .then(([p, c]) => {
        if (cancelled) return;
        setProvider(p);
        setCountry(c);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Provider or country not found."
            : "Failed to load this page.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.providerId, params.countryId]);

  const backHref = `/admin/pricing/providers/${params.providerId}/countries/${params.countryId}`;

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to country
      </Link>

      {isLoading && (
        <div className="max-w-4xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && provider && country && (
        <RateEditorForm
          zoneId={country.zoneId}
          backHref={backHref}
          context={{
            rateProviderId: provider.id,
            rateProviderName: provider.name,
            countryName: country.countryName,
            zoneName: country.zoneName,
            shipmentType,
          }}
        />
      )}
    </div>
  );
}
