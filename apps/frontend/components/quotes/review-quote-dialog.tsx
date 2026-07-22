"use client";

import { useState, type ReactNode } from "react";
import type { QuoteRequest } from "@/lib/types/placeholder";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ReviewQuoteDialog({
  trigger,
  quote,
  onApprove,
  onReject,
}: {
  trigger: ReactNode;
  quote: QuoteRequest;
  onApprove: (amount: number) => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Review quote request"
          description={`${quote.customerName} — ${quote.origin} → ${quote.destination}, ${quote.weightKg}kg`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quote-amount">Quoted amount (₹)</Label>
              <Input
                id="quote-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Required to approve"
              />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onReject();
                  setOpen(false);
                }}
              >
                Reject
              </Button>
              <Button
                size="sm"
                disabled={!amount}
                onClick={() => {
                  onApprove(Number(amount));
                  setOpen(false);
                }}
              >
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
