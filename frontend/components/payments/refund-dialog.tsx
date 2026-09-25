"use client";

import { useState, type ReactNode } from "react";
import type { OrderDto } from "@nationwide/shared-types";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * Money going back out.
 *
 * The amount is asked for rather than assumed from what was paid: a refund after a cancellation
 * is the payment minus the cancellation fee, and a goodwill refund is whatever was agreed — the
 * full amount is the exception, not the rule.
 */
export function RefundDialog({
  trigger,
  order,
  /** What to put in the box — the amount actually owed, when the caller has worked it out. */
  defaultAmount,
  onConfirm,
}: {
  trigger: ReactNode;
  order: OrderDto;
  defaultAmount?: number;
  onConfirm: (amount: number, note?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    (defaultAmount ?? order.paidAmount)?.toString() ?? "",
  );
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Record a refund"
          description={`Order ${order.id.slice(0, 8)}${
            order.paidAmount != null
              ? ` — ₹${order.paidAmount.toLocaleString("en-IN")} was paid`
              : ""
          }`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Amount refunded</Label>
              <Input
                id="refund-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-note">Note</Label>
              <Input
                id="refund-note"
                placeholder="Why, and how it was sent back"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                disabled={!amount}
                onClick={() => {
                  onConfirm(Number(amount), note.trim() || undefined);
                  setOpen(false);
                }}
              >
                Record refund
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
