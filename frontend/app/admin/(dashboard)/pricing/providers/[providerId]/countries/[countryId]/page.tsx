"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Scale } from "lucide-react";
import type { CountryDetailDto, RateDto, ShipmentTypeCode } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { cn } from "@/lib/utils/cn";

const SHIPMENT_TYPES: { value: ShipmentTypeCode; label: string }[] = [
  { value: "DOCUMENT", label: "Document" },
  { value: "PARCEL", label: "Parcel" },
  { value: "PACKAGE", label: "Package" },
];

function weightLabel(rate: RateDto): string {
  return rate.weightFromKg === rate.weightToKg
    ? `${rate.weightFromKg}kg`
    : `${rate.weightFromKg}-${rate.weightToKg}kg`;
}

export default function CountryDetailPage() {
  const params = useParams<{ providerId: string; countryId: string }>();
  const [detail, setDetail] = useState<CountryDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode>("PACKAGE");
  const [rates, setRates] = useState<RateDto[]>([]);
  const [isLoadingRates, setIsLoadingRates] = useState(true);

  function loadDetail() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<CountryDetailDto>(
        `/admin/rate-providers/${params.providerId}/countries/${params.countryId}`,
      )
      .then((d) => {
        setDetail(d);
        const configured = d.services.find((s) => s.weightSlabCount > 0);
        if (configured) setShipmentType(configured.shipmentType);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? "This country isn't configured under this provider."
            : "Failed to load this country.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.providerId, params.countryId]);

  function loadRates() {
    setIsLoadingRates(true);
    apiClient
      .get<RateDto[]>(
        `/admin/rate-providers/${params.providerId}/countries/${params.countryId}/rates?shipmentType=${shipmentType}`,
      )
      .then(setRates)
      .catch(() => setRates([]))
      .finally(() => setIsLoadingRates(false));
  }

  useEffect(() => {
    if (!detail) return;
    // Refetching when the shipment type pill changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, shipmentType]);

  const serviceCounts = useMemo(() => {
    const map = new Map<ShipmentTypeCode, number>();
    detail?.services.forEach((s) => map.set(s.shipmentType, s.weightSlabCount));
    return map;
  }, [detail]);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href={`/admin/pricing/providers/${params.providerId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to provider
      </Link>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={loadDetail} />}

      {!isLoading && !error && detail && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{detail.countryName}</h2>
              <p className="text-xs text-muted-foreground">
                {detail.zoneName} · Last updated{" "}
                {detail.lastUpdatedAt ? new Date(detail.lastUpdatedAt).toLocaleDateString("en-IN") : "—"}
              </p>
            </div>
            <Badge variant={detail.isActive ? "success" : "neutral"}>
              {detail.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          <div className="flex gap-2">
            {SHIPMENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setShipmentType(t.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium",
                  shipmentType === t.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({serviceCounts.get(t.value) ?? 0})
                </span>
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Weight Categories</p>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/pricing/providers/${params.providerId}/countries/${params.countryId}/bulk-edit?shipmentType=${shipmentType}`}
                  >
                    <Button variant="secondary" size="sm" disabled={rates.length === 0}>
                      Bulk Edit
                    </Button>
                  </Link>
                  <Link
                    href={`/admin/pricing/providers/${params.providerId}/countries/${params.countryId}/rates/new?shipmentType=${shipmentType}`}
                  >
                    <Button size="sm">+ Add weight category</Button>
                  </Link>
                </div>
              </div>

              {isLoadingRates && (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-20" />
                  ))}
                </div>
              )}

              {!isLoadingRates && rates.length === 0 && (
                <EmptyState
                  icon={<Scale className="h-8 w-8" aria-hidden />}
                  title="No weight categories yet"
                  description={`Add one to start pricing ${SHIPMENT_TYPES.find((t) => t.value === shipmentType)?.label} shipments to ${detail.countryName}.`}
                />
              )}

              {!isLoadingRates && rates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {rates.map((rate) => (
                    <Link
                      key={rate.id}
                      href={`/admin/pricing/providers/${params.providerId}/countries/${params.countryId}/rates/${rate.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary",
                        rate.isActive ? "border-border" : "border-border opacity-60",
                      )}
                    >
                      <span className="font-medium text-foreground">{weightLabel(rate)}</span>
                      <span className="text-muted-foreground">
                        {rate.currency} {rate.baseRate.toLocaleString("en-IN")}
                      </span>
                      {!rate.isActive && (
                        <Badge variant="neutral" className="text-[10px]">
                          Inactive
                        </Badge>
                      )}
                    </Link>
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
