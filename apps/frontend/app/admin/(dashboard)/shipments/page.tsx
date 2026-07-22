"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { ShipmentAdminDetailDto, TrackingResultDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/page-state";
import { ShipmentLookupForm } from "@/features/admin/ShipmentLookupForm";
import { ShipmentDetailPanel } from "@/features/admin/ShipmentDetailPanel";
import { MapTrackingNumberForm } from "@/features/admin/MapTrackingNumberForm";
import { OverrideStatusForm, type OverrideInput } from "@/features/admin/OverrideStatusForm";

function AdminShipmentsPageInner() {
  const searchParams = useSearchParams();
  const initialTracking = searchParams.get("tracking") ?? undefined;
  const { showToast } = useToast();

  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [shipment, setShipment] = useState<ShipmentAdminDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadShipment(num: string) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ShipmentAdminDetailDto>(`/admin/shipments/${num}`);
      setShipment(data);
      setTrackingNumber(num);
    } catch (e) {
      setShipment(null);
      setTrackingNumber(null);
      setError(
        e instanceof ApiError && e.status === 404
          ? "No shipment found for that tracking number."
          : "Something went wrong looking up that shipment.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Auto-loading from a deep-linked ?tracking= param on mount is a one-shot lookup, not a
    // subscription to external state — there's nothing to synchronize against afterward.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialTracking) void loadShipment(initialTracking);
  }, [initialTracking]);

  async function handleRefresh() {
    if (!trackingNumber) return;
    setIsRefreshing(true);
    try {
      await apiClient.get<TrackingResultDto>(`/tracking/${trackingNumber}`);
      await loadShipment(trackingNumber);
      showToast({ variant: "success", title: "Tracking refreshed" });
    } catch {
      showToast({ variant: "error", title: "Failed to refresh tracking" });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleMap(externalTrackingNumber: string) {
    if (!trackingNumber) return;
    setIsMutating(true);
    try {
      const data = await apiClient.post<ShipmentAdminDetailDto>(
        `/admin/shipments/${trackingNumber}/external-tracking-number`,
        { externalTrackingNumber },
      );
      setShipment(data);
      showToast({ variant: "success", title: "Carrier tracking number mapped" });
    } catch {
      showToast({ variant: "error", title: "Failed to map the tracking number" });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleOverride(input: OverrideInput) {
    if (!trackingNumber) return;
    setIsMutating(true);
    try {
      const data = await apiClient.post<ShipmentAdminDetailDto>(
        `/admin/shipments/${trackingNumber}/override`,
        input,
      );
      setShipment(data);
      showToast({ variant: "success", title: "Status overridden" });
    } catch {
      showToast({ variant: "error", title: "Failed to override the status" });
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Look up any shipment by its NationWide tracking number.
        </p>
      </div>

      <ShipmentLookupForm
        onSubmit={loadShipment}
        isLoading={isLoading}
        initialValue={initialTracking}
      />

      {error && <ErrorState message={error} />}

      {shipment && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                isLoading={isRefreshing}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh Tracking
              </Button>
            </div>
            <ShipmentDetailPanel shipment={shipment} />
          </div>
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                Map carrier tracking number
              </p>
              <MapTrackingNumberForm onSubmit={handleMap} isSubmitting={isMutating} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                Manually override status
              </p>
              <OverrideStatusForm onSubmit={handleOverride} isSubmitting={isMutating} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminShipmentsPage() {
  return (
    <Suspense fallback={null}>
      <AdminShipmentsPageInner />
    </Suspense>
  );
}
