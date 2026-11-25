"use client";

import { useState, type ReactNode } from "react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { PincodeInput } from "@/components/ui/pincode-input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { MapPinField } from "@/components/ui/map-pin-picker";
import { googleMapsEnabled, type PickedAddress } from "@/lib/google-maps";
import { focusField } from "@/lib/utils/focus-first-invalid";

interface Form {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  instructions: string;
  pin: { lat: number; lng: number } | null;
}

function fromPickup(p: PickupRequestDto): Form {
  return {
    line1: p.pickupAddressLine1,
    line2: p.pickupAddressLine2 ?? "",
    city: p.pickupCity,
    state: p.pickupState,
    postalCode: p.pickupPostalCode,
    instructions: p.pickupInstructions ?? "",
    pin:
      p.pickupLatitude != null && p.pickupLongitude != null
        ? { lat: p.pickupLatitude, lng: p.pickupLongitude }
        : null,
  };
}

/**
 * Correct a pickup's address: search it, move the pin, or type it. Used by the assigned partner
 * and by staff; `endpoint` says which. Whoever did not make the change is told by the server.
 */
export function EditAddressDialog({
  pickup,
  endpoint,
  trigger,
  onDone,
}: {
  pickup: PickupRequestDto;
  /** PATCH target, e.g. /partner/pickup-requests/:id/address. */
  endpoint: string;
  trigger: ReactNode;
  onDone: (updated: PickupRequestDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(() => fromPickup(pickup));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const maps = googleMapsEnabled();

  function start() {
    setForm(fromPickup(pickup));
    setError(null);
    setTried(false);
    setOpen(true);
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  // A picked place or a moved pin fills what it knows and keeps what the partner typed by hand
  // (flat number, landmark) in line 2.
  function applyPicked(picked: PickedAddress) {
    setForm((f) => ({
      ...f,
      line1: picked.addressLine1 || f.line1,
      city: picked.city || f.city,
      state: picked.state || f.state,
      postalCode: picked.postalCode || f.postalCode,
      pin: picked.latitude != null && picked.longitude != null ? { lat: picked.latitude, lng: picked.longitude } : f.pin,
    }));
  }

  // Required, in the order the form shows them.
  const missing = (["line1", "pin", "city", "state"] as const).filter(
    (k) => !(k === "pin" ? form.postalCode : form[k]).trim(),
  );
  const ready = missing.length === 0;
  const [tried, setTried] = useState(false);
  const bad = (k: (typeof missing)[number]) => tried && missing.includes(k);

  async function save() {
    if (!ready) {
      setTried(true);
      setError("Fill in the street, city, state and PIN code.");
      const first = missing[0];
      focusField(first === "line1" ? (maps ? "edit-address-search" : "edit-address-line1") : `edit-address-${first}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(endpoint, {
        pickupAddressLine1: form.line1.trim(),
        pickupAddressLine2: form.line2.trim() || undefined,
        pickupCity: form.city.trim(),
        pickupState: form.state.trim(),
        pickupPostalCode: form.postalCode.trim(),
        pickupInstructions: form.instructions.trim(),
        ...(form.pin ? { pickupLatitude: form.pin.lat, pickupLongitude: form.pin.lng } : {}),
      });
      onDone(updated);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the address. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? start() : setOpen(false))}>
      <span onClick={start}>{trigger}</span>
      {open && (
        <DialogContent
          title="Edit pickup address"
          description={`Where to collect ${pickup.pickupContactName}'s parcel. Search it or move the pin, then check the lines below.`}
          className="max-w-lg"
        >
          <form
            className="space-y-4"
            data-no-draft
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {maps && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-address-search">Search address</Label>
                  <AddressAutocomplete
                    id="edit-address-search"
                    value={form.line1}
                    onChange={(v) => set("line1", v)}
                    onSelect={applyPicked}
                    regionCodes={["in"]}
                    placeholder="Building, street or area"
                  />
                </div>
                <MapPinField value={form.pin} onChange={applyPicked} className="h-56" />
                {!form.pin && (
                  <p className="text-xs text-warning">
                    No pin: the partner navigates by the typed address. Drop a pin for the exact door.
                  </p>
                )}
              </>
            )}

            {!maps && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-address-line1">Address line 1</Label>
                <Input
                  id="edit-address-line1"
                  value={form.line1}
                  onChange={(e) => set("line1", e.target.value)}
                  error={bad("line1")}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="edit-address-line2">Flat, floor, landmark (optional)</Label>
              <Input id="edit-address-line2" value={form.line2} onChange={(e) => set("line2", e.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-address-pin">PIN code</Label>
                <PincodeInput
                  id="edit-address-pin"
                  value={form.postalCode}
                  onChange={(v) => set("postalCode", v)}
                  error={bad("pin")}
                  onResolved={(place) =>
                    setForm((f) => ({ ...f, city: f.city || place.district || place.city, state: place.state || f.state }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-address-city">City</Label>
                <Input id="edit-address-city" value={form.city} onChange={(e) => set("city", e.target.value)} error={bad("city")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-address-state">State</Label>
                <Input id="edit-address-state" value={form.state} onChange={(e) => set("state", e.target.value)} error={bad("state")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-address-notes">Instructions for the partner (optional)</Label>
              <textarea
                id="edit-address-notes"
                rows={2}
                maxLength={500}
                value={form.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                className="block w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              />
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={saving}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" isLoading={saving}>
                Save address
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
