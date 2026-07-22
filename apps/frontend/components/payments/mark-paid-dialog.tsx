"use client";

import { useState, type ReactNode } from "react";
import type { PaymentMethod, PaymentRecord } from "@/lib/types/placeholder";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
];

export function MarkPaidDialog({
  trigger,
  payment,
  onConfirm,
}: {
  trigger: ReactNode;
  payment: PaymentRecord;
  onConfirm: (method: PaymentMethod) => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Mark payment as paid"
          description={`Order ${payment.orderId} — ₹${payment.amount}`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="method">Payment method</Label>
              <NativeSelect
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                onClick={() => {
                  onConfirm(method);
                  setOpen(false);
                }}
              >
                Confirm paid
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
