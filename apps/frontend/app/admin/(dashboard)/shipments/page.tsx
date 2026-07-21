"use client";

import { useState } from "react";
import type { ShipmentAdminDetailDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { ShipmentLookupForm } from "@/features/admin/ShipmentLookupForm";
import { ShipmentDetailPanel } from "@/features/admin/ShipmentDetailPanel";
import { MapTrackingNumberForm } from "@/features/admin/MapTrackingNumberForm";
import { OverrideStatusForm, type OverrideInput } from "@/features/admin/OverrideStatusForm";

export default function AdminShipmentsPage() {
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [shipment, setShipment] = useState<ShipmentAdminDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadShipment(num: string) {
    setIsLoading(true);
    setError(null);
    setMessage(null);
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

  async function handleMap(externalTrackingNumber: string) {
    if (!trackingNumber) return;
    setIsMutating(true);
    setError(null);
    try {
      const data = await apiClient.post<ShipmentAdminDetailDto>(
        `/admin/shipments/${trackingNumber}/external-tracking-number`,
        { externalTrackingNumber },
      );
      setShipment(data);
      setMessage("Carrier tracking number mapped.");
    } catch {
      setError("Failed to map the tracking number.");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleOverride(input: OverrideInput) {
    if (!trackingNumber) return;
    setIsMutating(true);
    setError(null);
    try {
      const data = await apiClient.post<ShipmentAdminDetailDto>(
        `/admin/shipments/${trackingNumber}/override`,
        input,
      );
      setShipment(data);
      setMessage("Status overridden.");
    } catch {
      setError("Failed to override the status.");
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Shipments</h1>
      <ShipmentLookupForm onSubmit={loadShipment} isLoading={isLoading} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      {shipment && (
        <div className="grid gap-6 md:grid-cols-2">
          <ShipmentDetailPanel shipment={shipment} />
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium">Map carrier tracking number</p>
              <MapTrackingNumberForm onSubmit={handleMap} isSubmitting={isMutating} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Manually override status</p>
              <OverrideStatusForm onSubmit={handleOverride} isSubmitting={isMutating} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
