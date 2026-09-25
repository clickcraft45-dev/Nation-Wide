"use client";

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import type { CompanySettingsDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

/**
 * What a customer pays to call off an order before an AWB exists.
 *
 * A cancelled pickup still costs the business the trip, so the charge is a flat fee plus a per-km
 * rate over the driving distance from the warehouse to the pickup address. Both numbers and the
 * warehouse's own coordinates are set here — a pickup with no coordinates is charged the flat fee
 * alone rather than a guessed distance.
 */
export function CancellationChargesCard() {
  const [settings, setSettings] = useState<CompanySettingsDto | null>(null);
  const [baseFee, setBaseFee] = useState("");
  const [perKmFee, setPerKmFee] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<CompanySettingsDto>("/admin/company-settings")
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setBaseFee(String(res.cancellationBaseFee));
        setPerKmFee(String(res.cancellationPerKmFee));
        setLatitude(res.warehouseLatitude == null ? "" : String(res.warehouseLatitude));
        setLongitude(res.warehouseLongitude == null ? "" : String(res.warehouseLongitude));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Failed to load cancellation charges."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setError(null);
    setIsSaving(true);
    try {
      const saved = await apiClient.patch<CompanySettingsDto>("/admin/company-settings", {
        cancellationBaseFee: Number(baseFee) || 0,
        cancellationPerKmFee: Number(perKmFee) || 0,
        // Left blank means "not set", which the fee calculation reads as no distance to charge.
        ...(latitude.trim() === "" ? {} : { warehouseLatitude: Number(latitude) }),
        ...(longitude.trim() === "" ? {} : { warehouseLongitude: Number(longitude) }),
      });
      setSettings(saved);
      showToast({ variant: "success", title: "Cancellation charges saved" });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the cancellation charges."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-4 w-4" aria-hidden />
          Cancellation charges
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Charged when a customer cancels before an AWB is issued: a flat fee plus a per-km rate
          over the driving distance from the warehouse to the pickup address.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settings && !error && <Skeleton className="h-24 w-full" />}

        {settings && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cancel-base-fee">Base fee (₹)</Label>
                <Input
                  id="cancel-base-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={baseFee}
                  onChange={(e) => setBaseFee(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-per-km">Per km (₹)</Label>
                <Input
                  id="cancel-per-km"
                  type="number"
                  min="0"
                  step="0.01"
                  value={perKmFee}
                  onChange={(e) => setPerKmFee(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="warehouse-lat">Warehouse latitude</Label>
                <Input
                  id="warehouse-lat"
                  type="number"
                  step="0.000001"
                  placeholder="17.385000"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="warehouse-lng">Warehouse longitude</Label>
                <Input
                  id="warehouse-lng"
                  type="number"
                  step="0.000001"
                  placeholder="78.486700"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </div>
            </div>

            {error && <FieldError>{error}</FieldError>}

            <Button size="sm" isLoading={isSaving} onClick={save}>
              Save charges
            </Button>
          </>
        )}

        {!settings && error && <FieldError>{error}</FieldError>}
      </CardContent>
    </Card>
  );
}
