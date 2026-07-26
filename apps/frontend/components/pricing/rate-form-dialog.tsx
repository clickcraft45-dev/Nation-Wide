"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  DuplicateRateConflictDto,
  RateDto,
  RateProviderDto,
  ShipmentTypeCode,
  ZoneDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

type WeightMode = "exact" | "range";

const SHIPMENT_TYPES: { value: ShipmentTypeCode; label: string }[] = [
  { value: "DOCUMENT", label: "Document" },
  { value: "PARCEL", label: "Parcel" },
  { value: "PACKAGE", label: "Package" },
];

interface FormState {
  rateProviderId: string;
  zoneId: string;
  shipmentType: ShipmentTypeCode;
  weightMode: WeightMode;
  weightFromKg: string;
  weightToKg: string;
  baseRate: string;
  pssAmount: string;
  fuelChargePercent: string;
  gstPercent: string;
  nationwideCut: string;
}

function emptyForm(): FormState {
  return {
    rateProviderId: "",
    zoneId: "",
    shipmentType: "PACKAGE",
    weightMode: "exact",
    weightFromKg: "",
    weightToKg: "",
    baseRate: "",
    pssAmount: "0",
    fuelChargePercent: "0",
    gstPercent: "0",
    nationwideCut: "0",
  };
}

function formFromRate(rate: RateDto): FormState {
  const isExact = rate.weightFromKg === rate.weightToKg;
  return {
    rateProviderId: rate.rateProviderId,
    zoneId: rate.zoneId,
    shipmentType: rate.shipmentType,
    weightMode: isExact ? "exact" : "range",
    weightFromKg: String(rate.weightFromKg),
    weightToKg: String(rate.weightToKg),
    baseRate: String(rate.baseRate),
    pssAmount: String(rate.pssAmount),
    fuelChargePercent: String(rate.fuelChargePercent),
    gstPercent: String(rate.gstPercent),
    nationwideCut: String(rate.nationwideCut),
  };
}

function fieldsPayload(form: FormState) {
  return {
    weightFromKg: Number(form.weightFromKg),
    weightToKg: form.weightMode === "exact" ? Number(form.weightFromKg) : Number(form.weightToKg),
    baseRate: Number(form.baseRate),
    pssAmount: Number(form.pssAmount) || 0,
    fuelChargePercent: Number(form.fuelChargePercent) || 0,
    gstPercent: Number(form.gstPercent) || 0,
    nationwideCut: Number(form.nationwideCut) || 0,
  };
}

// Combined create/edit — pass `rate` to edit an existing one (Provider/Zone/Type/Weight become
// read-only context, matching "the Admin should be able to confirm the correct combination is
// being updated"); omit it for the full Provider -> Zone -> Shipment Type -> Weight -> 5 fields
// wizard. Create handles the server's 409 duplicate-rate response inline, offering to update the
// existing rate instead of silently failing or creating a second one.
export function RateFormDialog({
  trigger,
  rate,
  onSaved,
}: {
  trigger: ReactNode;
  rate?: RateDto;
  onSaved: (rate: RateDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<RateProviderDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [form, setForm] = useState<FormState>(() => (rate ? formFromRate(rate) : emptyForm()));
  const [conflict, setConflict] = useState<DuplicateRateConflictDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!open || rate) return;
    // Populating the provider picker when the dialog opens is a one-shot lookup, not a
    // subscription.
    apiClient
      .get<RateProviderDto[]>("/admin/rate-providers")
      .then((p) => setProviders(p.filter((x) => x.isActive)));
  }, [open, rate]);

  useEffect(() => {
    if (!open || rate || !form.rateProviderId) return;
    // Zones are provider-scoped — reload whenever the selected provider changes. The zoneId
    // chosen under a previous provider is cleared synchronously in the Provider select's own
    // onChange handler below, not here, so the payload can never mismatch.
    apiClient
      .get<ZoneDto[]>(`/admin/zones?rateProviderId=${form.rateProviderId}`)
      .then(setZones);
  }, [open, rate, form.rateProviderId]);

  function reset() {
    setForm(rate ? formFromRate(rate) : emptyForm());
    setConflict(null);
    setError(null);
  }

  function validate(): string | null {
    if (!rate && (!form.rateProviderId || !form.zoneId)) {
      return "Select a provider and a zone.";
    }
    const from = Number(form.weightFromKg);
    const to = form.weightMode === "exact" ? from : Number(form.weightToKg);
    if (!form.weightFromKg || Number.isNaN(from) || from < 0) {
      return "Enter a valid weight.";
    }
    if (form.weightMode === "range" && (!form.weightToKg || Number.isNaN(to) || to < from)) {
      return "Weight range 'to' must be greater than or equal to 'from'.";
    }
    if (!form.baseRate || Number(form.baseRate) <= 0) {
      return "Base rate must be a positive amount.";
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
      const saved = rate
        ? await apiClient.patch<RateDto>(`/admin/rates/${rate.id}`, fieldsPayload(form))
        : await apiClient.post<RateDto>("/admin/rates", {
            zoneId: form.zoneId,
            shipmentType: form.shipmentType,
            ...fieldsPayload(form),
          });
      showToast({ variant: "success", title: rate ? "Rate updated" : "Rate saved" });
      onSaved(saved);
      setOpen(false);
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
        setError("That weight range overlaps an existing active rate for this provider/zone/type.");
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
      const saved = await apiClient.patch<RateDto>(
        `/admin/rates/${conflict.existingRateId}`,
        fieldsPayload(form),
      );
      showToast({ variant: "success", title: "Existing rate updated" });
      onSaved(saved);
      setOpen(false);
    } catch {
      setError("Couldn't update the existing rate. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title={rate ? "Edit rate" : "Add new rate"}>
          {conflict ? (
            <div className="space-y-4">
              <p className="text-sm text-foreground">A rate already exists for:</p>
              <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Provider: </span>
                  {conflict.rateProviderName}
                </p>
                <p>
                  <span className="text-muted-foreground">Zone: </span>
                  {conflict.zoneName}
                </p>
                <p>
                  <span className="text-muted-foreground">Type: </span>
                  {conflict.shipmentType}
                </p>
                <p>
                  <span className="text-muted-foreground">Weight: </span>
                  {conflict.weightFromKg === conflict.weightToKg
                    ? `${conflict.weightFromKg}kg`
                    : `${conflict.weightFromKg}-${conflict.weightToKg}kg`}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">What would you like to do?</p>
              {error && <FieldError>{error}</FieldError>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setConflict(null)}
                >
                  Cancel
                </Button>
                <Button size="sm" isLoading={isSubmitting} onClick={handleUpdateExisting}>
                  Update Existing Rate
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {rate ? (
                <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Provider: </span>
                    {rate.rateProviderName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Zone: </span>
                    {rate.zoneName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Type: </span>
                    {rate.shipmentType}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Weight: </span>
                    {rate.weightFromKg === rate.weightToKg
                      ? `${rate.weightFromKg}kg`
                      : `${rate.weightFromKg}-${rate.weightToKg}kg`}
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="rate-provider">Provider</Label>
                    <NativeSelect
                      id="rate-provider"
                      value={form.rateProviderId}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, rateProviderId: e.target.value, zoneId: "" }));
                        setZones([]);
                      }}
                    >
                      <option value="">Select a provider…</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rate-zone">Zone</Label>
                    <NativeSelect
                      id="rate-zone"
                      value={form.zoneId}
                      onChange={(e) => setForm((f) => ({ ...f, zoneId: e.target.value }))}
                      disabled={!form.rateProviderId}
                    >
                      <option value="">
                        {form.rateProviderId ? "Select a zone…" : "Select a provider first…"}
                      </option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({z.countryCount} countries)
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rate-shipment-type">Shipment type</Label>
                    <NativeSelect
                      id="rate-shipment-type"
                      value={form.shipmentType}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipmentType: e.target.value as ShipmentTypeCode,
                        }))
                      }
                    >
                      {SHIPMENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Weight</Label>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="weight-mode"
                          checked={form.weightMode === "exact"}
                          onChange={() => setForm((f) => ({ ...f, weightMode: "exact" }))}
                        />
                        Exact weight
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="weight-mode"
                          checked={form.weightMode === "range"}
                          onChange={() => setForm((f) => ({ ...f, weightMode: "range" }))}
                        />
                        Weight range
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={form.weightMode === "exact" ? "e.g. 2" : "From"}
                        value={form.weightFromKg}
                        onChange={(e) => setForm((f) => ({ ...f, weightFromKg: e.target.value }))}
                      />
                      {form.weightMode === "range" && (
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="To"
                          value={form.weightToKg}
                          onChange={(e) => setForm((f) => ({ ...f, weightToKg: e.target.value }))}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rate-base">Base / Fixed Provider Rate</Label>
                  <Input
                    id="rate-base"
                    type="number"
                    step="0.01"
                    value={form.baseRate}
                    onChange={(e) => setForm((f) => ({ ...f, baseRate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate-pss">PSS</Label>
                  <Input
                    id="rate-pss"
                    type="number"
                    step="0.01"
                    value={form.pssAmount}
                    onChange={(e) => setForm((f) => ({ ...f, pssAmount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate-fuel">Fuel Charge %</Label>
                  <Input
                    id="rate-fuel"
                    type="number"
                    step="0.01"
                    value={form.fuelChargePercent}
                    onChange={(e) => setForm((f) => ({ ...f, fuelChargePercent: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate-gst">GST %</Label>
                  <Input
                    id="rate-gst"
                    type="number"
                    step="0.01"
                    value={form.gstPercent}
                    onChange={(e) => setForm((f) => ({ ...f, gstPercent: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate-cut">NationWide Cut</Label>
                  <Input
                    id="rate-cut"
                    type="number"
                    step="0.01"
                    value={form.nationwideCut}
                    onChange={(e) => setForm((f) => ({ ...f, nationwideCut: e.target.value }))}
                  />
                </div>
              </div>

              {error && <FieldError>{error}</FieldError>}

              <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" size="sm" isLoading={isSubmitting}>
                  Save Rate
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
