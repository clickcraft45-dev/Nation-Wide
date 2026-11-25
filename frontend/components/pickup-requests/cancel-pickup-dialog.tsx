"use client";

import { useId, useState, type ReactNode } from "react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
import { focusField } from "@/lib/utils/focus-first-invalid";

/** Staff call a pickup off, with the reason the customer is sent. Before any money is taken. */
export function CancelPickupDialog({
  pickup,
  trigger,
  onDone,
}: {
  pickup: PickupRequestDto;
  trigger: ReactNode;
  onDone: (updated: PickupRequestDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reasonId = useId();
  const canSave = reason.trim().length >= 3;
  const [tried, setTried] = useState(false);

  async function save() {
    if (!canSave) {
      setTried(true);
      setError("Give a reason (at least 3 characters).");
      focusField(reasonId);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `/admin/pickup-requests/${pickup.id}/cancel`,
        { reason: reason.trim() },
      );
      onDone(updated);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't cancel the pickup. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setReason("");
          setError(null);
          setTried(false);
        }
        setOpen(next);
      }}
    >
      <span
        onClick={() => {
          setReason("");
          setError(null);
          setTried(false);
          setOpen(true);
        }}
      >
        {trigger}
      </span>
      {open && (
        <DialogContent
          title={`Cancel pickup for ${pickup.customerName}?`}
          description={
            pickup.assignedPartnerName
              ? `${pickup.assignedPartnerName} is told on their phone, and the customer gets your reason on WhatsApp.`
              : "The customer gets your reason on WhatsApp."
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
              <Label htmlFor={reasonId}>Reason</Label>
              <textarea
                id={reasonId}
                rows={2}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={tried && !canSave}
                placeholder="For example: customer called to cancel, duplicate booking…"
                className="block w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger sm:text-sm"
              />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm" disabled={saving}>
                  Keep pickup
                </Button>
              </DialogClose>
              <Button type="submit" variant="danger" size="sm" isLoading={saving}>
                Cancel pickup
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
