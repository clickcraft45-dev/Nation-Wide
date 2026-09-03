"use client";

import { useState, type ReactNode } from "react";
import type { CountryDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

// Combined create/edit — pass `country` to edit an existing row (code becomes read-only, same
// reasoning as RateProviderDialog), omit it to create a new one.
export function CountryDialog({
  trigger,
  country,
  onSaved,
}: {
  trigger: ReactNode;
  country?: CountryDto;
  onSaved: (country: CountryDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(country?.code ?? "");
  const [name, setName] = useState(country?.name ?? "");
  const [isActive, setIsActive] = useState(country?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || (!country && !code.trim())) {
      setError("Code and name are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = country
        ? await apiClient.patch<CountryDto>(`/admin/countries/${country.id}`, {
            name: name.trim(),
            isActive,
          })
        : await apiClient.post<CountryDto>("/admin/countries", {
            code: code.trim(),
            name: name.trim(),
          });
      showToast({ variant: "success", title: country ? "Country updated" : "Country created" });
      onSaved(saved);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "That country code or name is already in use."
          : "Couldn't save the country. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title={country ? "Edit country" : "New country"}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="country-code">Code</Label>
              <Input
                id="country-code"
                placeholder="e.g. US"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={Boolean(country)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country-name">Name</Label>
              <Input
                id="country-name"
                placeholder="e.g. USA"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {country && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Active (available as a quote destination)
              </label>
            )}

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                {country ? "Save changes" : "Create country"}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
