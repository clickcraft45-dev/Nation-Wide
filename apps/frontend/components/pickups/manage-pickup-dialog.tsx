"use client";

import { useState, type ReactNode } from "react";
import type { PickupRecord, PickupStatus } from "@/lib/types/placeholder";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const STATUSES: PickupStatus[] = ["PENDING", "COMPLETED", "RESCHEDULED"];

export function ManagePickupDialog({
  trigger,
  pickup,
  onSave,
}: {
  trigger: ReactNode;
  pickup: PickupRecord;
  onSave: (update: Partial<PickupRecord>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PickupStatus>(pickup.status);
  const [weight, setWeight] = useState(pickup.weightVerifiedKg?.toString() ?? "");
  const [notes, setNotes] = useState(pickup.notes ?? "");
  const [date, setDate] = useState(pickup.date);
  const [timeSlot, setTimeSlot] = useState(pickup.timeSlot);

  function handleSave() {
    onSave({
      status,
      weightVerifiedKg: weight ? Number(weight) : null,
      notes: notes.trim() || null,
      date,
      timeSlot,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title="Manage pickup" description={pickup.customerName}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pickup-status">Status</Label>
              <NativeSelect
                id="pickup-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as PickupStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pickup-date">Date</Label>
                <Input
                  id="pickup-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pickup-slot">Time slot</Label>
                <Input
                  id="pickup-slot"
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                />
              </div>
            </div>
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
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
