"use client";

import { useState, type ReactNode } from "react";
import type { PickupDto, PickupStatusCode } from "@nationwide/shared-types";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

// Only the statuses actually reachable from the pickup's current one — mirrors
// PickupsService's transition map so the UI never offers an action the backend would reject.
const PICKUP_TRANSITIONS: Record<PickupStatusCode, PickupStatusCode[]> = {
  SCHEDULED: ["PENDING", "CANCELLED"],
  PENDING: ["ASSIGNED", "CANCELLED", "PICKUP_FAILED"],
  ASSIGNED: ["PICKUP_IN_PROGRESS", "CANCELLED", "PICKUP_FAILED"],
  PICKUP_IN_PROGRESS: ["PICKED_UP", "PICKUP_FAILED"],
  PICKED_UP: [],
  CANCELLED: [],
  PICKUP_FAILED: [],
  DROPPED_OFF: [],
};

const DROP_OFF_TRANSITIONS: Record<PickupStatusCode, PickupStatusCode[]> = {
  SCHEDULED: ["DROPPED_OFF", "CANCELLED"],
  PENDING: [],
  ASSIGNED: [],
  PICKUP_IN_PROGRESS: [],
  PICKED_UP: [],
  CANCELLED: [],
  PICKUP_FAILED: [],
  DROPPED_OFF: [],
};

const STATUS_LABEL: Record<PickupStatusCode, string> = {
  SCHEDULED: "Scheduled",
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  PICKUP_IN_PROGRESS: "Pickup in progress",
  PICKED_UP: "Picked up",
  CANCELLED: "Cancelled",
  PICKUP_FAILED: "Pickup failed",
  DROPPED_OFF: "Dropped off",
};

export function ManagePickupDialog({
  trigger,
  pickup,
  onSave,
}: {
  trigger: ReactNode;
  pickup: PickupDto;
  onSave: (update: { status: PickupStatusCode; weightVerifiedKg?: number; notes?: string }) => void;
}) {
  const transitions = pickup.method === "WAREHOUSE_DROP_OFF" ? DROP_OFF_TRANSITIONS : PICKUP_TRANSITIONS;
  const availableStatuses = transitions[pickup.status];

  const [open, setOpen] = useState(false);
  // pickup.status itself is never a valid selectable target (see transition maps above), so
  // default to the first status it can actually move to, not the current one.
  const [status, setStatus] = useState<PickupStatusCode>(
    availableStatuses[0] ?? pickup.status,
  );
  const [weight, setWeight] = useState(pickup.weightVerifiedKg?.toString() ?? "");
  const [notes, setNotes] = useState(pickup.notes ?? "");

  function handleSave() {
    onSave({
      status,
      weightVerifiedKg: weight ? Number(weight) : undefined,
      notes: notes.trim() || undefined,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title="Manage pickup" description={pickup.customerName}>
          <div className="space-y-4">
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p>
                {pickup.method === "PICKUP"
                  ? `${pickup.scheduledDate ?? "—"} · ${pickup.scheduledTimeSlot ?? "—"}`
                  : "Warehouse drop-off"}
              </p>
            </div>

            {availableStatuses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This pickup is in a final state ({STATUS_LABEL[pickup.status]}) and can no
                longer be updated.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="pickup-status">Update status to</Label>
                <NativeSelect
                  id="pickup-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PickupStatusCode)}
                >
                  {availableStatuses.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {availableStatuses.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pickup-weight">Verified weight (kg)</Label>
                  <Input
                    id="pickup-weight"
                    type="number"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pickup-notes">Notes</Label>
                  <Input id="pickup-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Close
                </Button>
              </DialogClose>
              {availableStatuses.length > 0 && (
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
