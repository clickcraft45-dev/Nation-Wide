"use client";

import { useState, type ReactNode } from "react";
import type { ZoneDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

// Combined create/rename — pass `zone` to rename an existing one, or `rateProviderId` (with no
// `zone`) to create a new zone under that provider. Mirrors CountryDialog's pattern.
export function ZoneDialog({
  trigger,
  rateProviderId,
  zone,
  onSaved,
}: {
  trigger: ReactNode;
  rateProviderId: string;
  zone?: ZoneDto;
  onSaved: (zone: ZoneDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(zone?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a zone name.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = zone
        ? await apiClient.patch<ZoneDto>(`/admin/zones/${zone.id}`, { name: name.trim() })
        : await apiClient.post<ZoneDto>("/admin/zones", { rateProviderId, name: name.trim() });
      showToast({ variant: "success", title: zone ? "Zone renamed" : "Zone created" });
      onSaved(saved);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "A zone with that name already exists for this provider."
          : "Couldn't save the zone. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title={zone ? "Rename zone" : "New zone"}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="zone-name">Zone name</Label>
              <Input
                id="zone-name"
                placeholder="e.g. Zone A, Zone 11, Zone 9A"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use the exact name from the carrier&apos;s own tariff sheet.
              </p>
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                {zone ? "Save changes" : "Create zone"}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
