"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DuplicateRateConflictDto,
  RateDto,
  RatePreviewResultDto,
  ShipmentTypeCode,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";

type WeightMode = "exact" | "range";

interface Context {
  rateProviderId: string;
  rateProviderName: string;
  countryName: string;
  zoneName: string;
  shipmentType: ShipmentTypeCode;
}

const SHIPMENT_TYPE_LABELS: Record<ShipmentTypeCode, string> = {
  DOCUMENT: "Document",
  PARCEL: "Parcel",
  PACKAGE: "Package",
  OTHER: "Other",
};

// Adapted from the former RateFormDialog's edit-mode logic, but rendered as a focused,
// full-page editor instead of a modal, with Provider/Country/Type/Weight shown as read-only
// context (fixed by the URL) plus a live "Final Calculated Price" preview.
export function RateEditorForm({
  context,
  zoneId,
  rate,
  backHref,
}: {
  context: Context;
  // Only required when creating a new rate — POST /admin/rates still takes a zoneId.
  zoneId?: string;
  rate?: RateDto;
  backHref: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [weightMode, setWeightMode] = useState<WeightMode>(
    rate && rate.weightFromKg !== rate.weightToKg ? "range" : "exact",
  );
  const [weightFromKg, setWeightFromKg] = useState(rate ? String(rate.weightFromKg) : "");
  const [weightToKg, setWeightToKg] = useState(rate ? String(rate.weightToKg) : "");
  const [baseRate, setBaseRate] = useState(rate ? String(rate.baseRate) : "");
  const [gstPercent, setGstPercent] = useState(rate ? String(rate.gstPercent) : "0");
  const [nationwideCut, setNationwideCut] = useState(rate ? String(rate.nationwideCut) : "0");
  const [reason, setReason] = useState("");

  const [conflict, setConflict] = useState<DuplicateRateConflictDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [preview, setPreview] = useState<RatePreviewResultDto | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const debouncedInputs = useDebouncedValue(
    { weightFromKg, baseRate, gstPercent, nationwideCut },
    350,
  );

  useEffect(() => {
    const weightKg = Number(debouncedInputs.weightFromKg);
    const base = Number(debouncedInputs.baseRate);
    if (!debouncedInputs.weightFromKg || Number.isNaN(weightKg) || weightKg <= 0) {
      // Dropping a now-stale preview when the inputs stop being valid — one render, not a loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    if (!debouncedInputs.baseRate || Number.isNaN(base) || base <= 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    apiClient
      .post<RatePreviewResultDto>("/admin/rates/preview", {
        rateProviderId: context.rateProviderId,
        weightKg,
        baseRate: base,
        gstPercent: Number(debouncedInputs.gstPercent) || 0,
        nationwideCut: Number(debouncedInputs.nationwideCut) || 0,
      })
      .then((res) => {
        if (!cancelled) {
          setPreview(res);
          setPreviewError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedInputs, context.rateProviderId]);

  function fieldsPayload() {
    return {
      weightFromKg: Number(weightFromKg),
      weightToKg: weightMode === "exact" ? Number(weightFromKg) : Number(weightToKg),
      baseRate: Number(baseRate),
      gstPercent: Number(gstPercent) || 0,
      nationwideCut: Number(nationwideCut) || 0,
      reason: reason.trim() || undefined,
    };
  }

  function validate(): string | null {
    const from = Number(weightFromKg);
    const to = weightMode === "exact" ? from : Number(weightToKg);
    if (!weightFromKg || Number.isNaN(from) || from < 0) {
      return "Enter a valid weight.";
    }
    if (weightMode === "range" && (!weightToKg || Number.isNaN(to) || to < from)) {
      return "Weight range 'to' must be greater than or equal to 'from'.";
    }
    if (!baseRate || Number(baseRate) <= 0) {
      return "Fixed Rate must be a positive amount.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (rate) {
        await apiClient.patch<RateDto>(`/admin/rates/${rate.id}`, fieldsPayload());
      } else {
        await apiClient.post<RateDto>("/admin/rates", {
          zoneId,
          shipmentType: context.shipmentType,
          ...fieldsPayload(),
        });
      }
      showToast({ variant: "success", title: rate ? "Rate updated" : "Rate saved" });
      router.push(backHref);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        typeof err.body === "object" &&
        err.body !== null &&
        (err.body as DuplicateRateConflictDto).message === "duplicate_rate"
      ) {
        setConflict(err.body as DuplicateRateConflictDto);
      } else if (err instanceof ApiError && err.status === 400) {
        setError("That weight range overlaps an existing active rate for this provider/country/type.");
      } else {
        setError("Couldn't save the rate. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateExisting() {
    if (!conflict) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.patch<RateDto>(`/admin/rates/${conflict.existingRateId}`, fieldsPayload());
      showToast({ variant: "success", title: "Existing rate updated" });
      router.push(`${backHref}/rates/${conflict.existingRateId}`);
    } catch {
      setError("Couldn't update the existing rate. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleActive() {
    if (!rate) return;
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/admin/rates/${rate.id}/active`, {
        isActive: !rate.isActive,
        reason: reason.trim() || undefined,
      });
      showToast({ variant: "success", title: rate.isActive ? "Rate deactivated" : "Rate activated" });
      router.push(backHref);
    } catch {
      showToast({ variant: "error", title: "Couldn't update the rate. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (conflict) {
    return (
      <Card className="max-w-xl">
        <CardContent className="space-y-4 pt-5">
          <p className="text-sm text-foreground">A rate already exists for:</p>
          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p><span className="text-muted-foreground">Provider: </span>{conflict.rateProviderName}</p>
            <p><span className="text-muted-foreground">Zone: </span>{conflict.zoneName}</p>
            <p><span className="text-muted-foreground">Type: </span>{conflict.shipmentType}</p>
            <p>
              <span className="text-muted-foreground">Weight: </span>
              {conflict.weightFromKg === conflict.weightToKg
                ? `${conflict.weightFromKg}kg`
                : `${conflict.weightFromKg}-${conflict.weightToKg}kg`}
            </p>
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setConflict(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={handleUpdateExisting}>
              Update Existing Rate
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p><span className="text-muted-foreground">Provider: </span>{context.rateProviderName}</p>
              <p><span className="text-muted-foreground">Country: </span>{context.countryName}</p>
              <p><span className="text-muted-foreground">Zone: </span>{context.zoneName}</p>
              <p><span className="text-muted-foreground">Type: </span>{SHIPMENT_TYPE_LABELS[context.shipmentType]}</p>
            </div>

            {rate ? (
              <div className="space-y-1.5">
                <Label>Weight</Label>
                <p className="text-sm text-foreground">
                  {rate.weightFromKg === rate.weightToKg
                    ? `${rate.weightFromKg}kg`
                    : `${rate.weightFromKg}-${rate.weightToKg}kg`}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Weight</Label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="weight-mode"
                      checked={weightMode === "exact"}
                      onChange={() => setWeightMode("exact")}
                    />
                    Exact weight
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="weight-mode"
                      checked={weightMode === "range"}
                      onChange={() => setWeightMode("range")}
                    />
                    Weight range
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={weightMode === "exact" ? "e.g. 2" : "From"}
                    aria-label={weightMode === "exact" ? "Weight in kg" : "From weight in kg"}
                    value={weightFromKg}
                    onChange={(e) => setWeightFromKg(e.target.value)}
                  />
                  {weightMode === "range" && (
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="To"
                      aria-label="To weight in kg"
                      value={weightToKg}
                      onChange={(e) => setWeightToKg(e.target.value)}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rate-base">Fixed Rate</Label>
                <Input
                  id="rate-base"
                  type="number"
                  step="0.01"
                  value={baseRate}
                  onChange={(e) => setBaseRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rate-gst">GST %</Label>
                <Input
                  id="rate-gst"
                  type="number"
                  step="0.01"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="rate-cut">NationWide Margin</Label>
                <Input
                  id="rate-cut"
                  type="number"
                  step="0.01"
                  value={nationwideCut}
                  onChange={(e) => setNationwideCut(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate-reason">Reason (optional)</Label>
              <Input
                id="rate-reason"
                placeholder="e.g. Quarterly carrier rate revision"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex items-center justify-between pt-2">
              <div>
                {rate && (
                  <Button type="button" variant="secondary" size="sm" onClick={toggleActive} isLoading={isSubmitting}>
                    {rate.isActive ? "Deactivate" : "Activate"}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => router.push(backHref)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isSubmitting}>
                  Save Changes
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm font-medium text-foreground">Final Calculated Price (Preview)</p>
          {previewError && <p className="text-sm text-danger">Couldn&apos;t compute a preview.</p>}
          {!previewError && !preview && (
            <p className="text-sm text-muted-foreground">Enter a weight and Fixed Rate to see the price.</p>
          )}
          {preview && (
            <dl className="space-y-2 text-sm">
              <Row label="Base Rate" value={preview.baseRate} />
              <Row label="PSS" value={preview.pssAmount} />
              <Row label={`Fuel Charge (${preview.fuelChargePercent}%)`} value={preview.fuelChargeAmount} />
              <Row label="Taxable Subtotal" value={preview.taxableSubtotal} muted />
              <Row label={`GST (${preview.gstPercent}%)`} value={preview.gstAmount} />
              <Row label="NationWide Margin" value={preview.nationwideCut} />
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <dt className="font-medium text-foreground">Final Price</dt>
                <dd className="text-lg font-semibold text-foreground">
                  ₹{preview.finalPrice.toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</dt>
      <dd className={muted ? "text-muted-foreground" : "text-foreground"}>
        ₹{value.toLocaleString("en-IN")}
      </dd>
    </div>
  );
}
