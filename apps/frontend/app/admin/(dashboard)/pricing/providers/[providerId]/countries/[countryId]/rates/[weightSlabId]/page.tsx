"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { CountryDetailDto, RateDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { RateEditorForm } from "@/components/pricing/rate-editor-form";

export default function EditRatePage() {
  const params = useParams<{ providerId: string; countryId: string; weightSlabId: string }>();
  const [rate, setRate] = useState<RateDto | null>(null);
  const [countryName, setCountryName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [r, c] = await Promise.all([
          apiClient.get<RateDto>(`/admin/rates/${params.weightSlabId}`),
          apiClient.get<CountryDetailDto>(
            `/admin/rate-providers/${params.providerId}/countries/${params.countryId}`,
          ),
        ]);
        if (cancelled) return;
        setRate(r);
        setCountryName(c.countryName);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Rate not found."
            : "Failed to load this rate.",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.providerId, params.countryId, params.weightSlabId]);

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

      {!isLoading && !error && rate && (
        <RateEditorForm
          rate={rate}
          backHref={backHref}
          context={{
            rateProviderId: rate.rateProviderId,
            rateProviderName: rate.rateProviderName,
            countryName,
            zoneName: rate.zoneName,
            shipmentType: rate.shipmentType,
          }}
        />
      )}
    </div>
  );
}
