"use client";

import { useId, useState, type ReactNode } from "react";
import {
  PICKUP_TIME_SLOTS,
  isPickupSlotOpen,
  localDateIso,
  type PickupRequestDto,
  type PickupTimeSlot,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { FieldError, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export const PICKUP_SLOT_LABELS: Record<PickupTimeSlot, string> = {
  "09:00-12:00": "9 AM to 12 PM",
  "12:00-15:00": "12 PM to 3 PM",
  "15:00-18:00": "3 PM to 6 PM",
};

const MIN_REASON = 3;

/**
 * Move a pickup to another day or slot, with the reason the customer is sent. Used by the partner
 * (before accepting) and by staff (any time before the partner arrives); `endpoint` says which.
 */
export function RescheduleDialog({
  pickup,
  endpoint,
  trigger,
  description,
  onDone,
}: {
  pickup: PickupRequestDto;
  /** PATCH target, e.g. /partner/pickup-requests/:id/reschedule. */
  endpoint: string;
  trigger: ReactNode;
  description?: string;
  onDone: (updated: PickupRequestDto) => void;
}) {
  const today = localDateIso();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<PickupTimeSlot | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reasonId = useId();
  const dateId = useId();

  function reset() {
    setDate(pickup.pickupDate && pickup.pickupDate >= today ? pickup.pickupDate : today);
    setSlot("");
    setReason("");
    setError(null);
  }

  const slotOpen = (s: PickupTimeSlot) => !date || date > today || isPickupSlotOpen(s, date);
  const unchanged = date === pickup.pickupDate && slot === pickup.pickupTimeSlot;
  const canSave = Boolean(date && slot && slotOpen(slot) && reason.trim().length >= MIN_REASON && !unchanged);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(endpoint, {
        pickupDate: date,
        pickupTimeSlot: slot,
        reason: reason.trim(),
      });
      onDone(updated);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't move the pickup. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <span
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {trigger}
      </span>
      {open && (
        <DialogContent
          title="Reschedule pickup"
          description={
            description ??
            `${pickup.pickupContactName}, now ${pickup.pickupDate ?? "no date"} · ${
              pickup.pickupTimeSlot ? PICKUP_SLOT_LABELS[pickup.pickupTimeSlot as PickupTimeSlot] ?? pickup.pickupTimeSlot : "no slot"
            }. The customer gets the new time and your reason on WhatsApp.`
          }
        >
          <form
            className="space-y-4"
            data-no-draft
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={dateId}>New day</Label>
              <DateField
                id={dateId}
                title="New pickup day"
                value={date}
                min={today}
                onChange={(v) => {
                  setDate(v);
                  if (slot && v === today && !isPickupSlotOpen(slot, v)) setSlot("");
                }}
              />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">New time slot</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PICKUP_TIME_SLOTS.map((s) => {
                  const available = slotOpen(s);
                  const selected = slot === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={selected}
                      disabled={!available}
                      onClick={() => setSlot(s)}
                      className={cn(
                        "min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-foreground hover:bg-muted active:bg-muted",
                      )}
                    >
                      {PICKUP_SLOT_LABELS[s]}
                    </button>
                  );
                })}
              </div>
              {date === today && PICKUP_TIME_SLOTS.every((s) => !slotOpen(s)) && (
                <p className="text-xs text-muted-foreground">Every slot today has closed. Pick another day.</p>
              )}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor={reasonId}>Reason</Label>
              <textarea
                id={reasonId}
                rows={2}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: vehicle breakdown, customer asked for the evening"
                className="block w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              />
            </div>

            {unchanged && <p className="text-xs text-muted-foreground">That is the time it already has.</p>}
            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm" disabled={saving}>
                  Keep current time
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={saving} disabled={!canSave}>
                Move pickup
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
