"use client";

import { useState, type ReactNode } from "react";
import type { RateProviderDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

// Combined create/edit — pass `provider` to edit an existing row (code becomes read-only since
// it's the natural key used by the pricing engine's lookups), omit it to create a new one.
export function RateProviderDialog({
  trigger,
  provider,
  onSaved,
}: {
  trigger: ReactNode;
  provider?: RateProviderDto;
  onSaved: (provider: RateProviderDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(provider?.code ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [isActive, setIsActive] = useState(provider?.isActive ?? true);
  const [fuelChargePercent, setFuelChargePercent] = useState(
    String(provider?.fuelChargePercent ?? 0),
  );
  const [pssPerKg, setPssPerKg] = useState(String(provider?.pssPerKg ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || (!provider && !code.trim())) {
      setError("Code and name are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = provider
        ? await apiClient.patch<RateProviderDto>(`/admin/rate-providers/${provider.id}`, {
            name: name.trim(),
            isActive,
            fuelChargePercent: Number(fuelChargePercent) || 0,
            pssPerKg: Number(pssPerKg) || 0,
          })
        : await apiClient.post<RateProviderDto>("/admin/rate-providers", {
            code: code.trim(),
            name: name.trim(),
          });
      showToast({ variant: "success", title: provider ? "Provider updated" : "Provider created" });
      onSaved(saved);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "That provider code is already in use."
          : "Couldn't save the provider. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title={provider ? "Edit provider" : "New provider"}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="provider-code">Code</Label>
              <Input
                id="provider-code"
                placeholder="e.g. FEDEX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={Boolean(provider)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-name">Name</Label>
              <Input
                id="provider-name"
                placeholder="e.g. FedEx"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {provider && (
              <>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Active (eligible for new quotes)
                </label>

                <div className="space-y-3 rounded-md border border-border p-3">
                  <p className="text-sm font-medium text-foreground">Provider Configuration</p>
                  <p className="text-xs text-muted-foreground">
                    Applies to every quotation for {provider.name} — no need to re-enter these
                    per country or weight. Past quotes keep the values that were active when they
                    were generated.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="provider-fuel-charge">Fuel Charge (%)</Label>
                      <Input
                        id="provider-fuel-charge"
                        type="number"
                        step="0.01"
                        min="0"
                        value={fuelChargePercent}
                        onChange={(e) => setFuelChargePercent(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="provider-pss">PSS (₹ per KG)</Label>
                      <Input
                        id="provider-pss"
                        type="number"
                        step="0.01"
                        min="0"
                        value={pssPerKg}
                        onChange={(e) => setPssPerKg(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                {provider ? "Save changes" : "Create provider"}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
