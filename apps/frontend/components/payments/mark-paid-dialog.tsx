"use client";

import { useState, type ReactNode } from "react";
import type { OrderDto, PaymentMethodCode } from "@nationwide/shared-types";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const METHODS: { value: PaymentMethodCode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
];

export function MarkPaidDialog({
  trigger,
  order,
  onConfirm,
}: {
  trigger: ReactNode;
  order: OrderDto;
  onConfirm: (method: PaymentMethodCode, amount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethodCode>("CASH");
  const [amount, setAmount] = useState(order.paidAmount?.toString() ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Mark payment as paid"
          description={`Order ${order.id.slice(0, 8)}`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="paid-amount">Amount</Label>
              <Input
                id="paid-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="method">Payment method</Label>
              <NativeSelect
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethodCode)}
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
                disabled={!amount}
                onClick={() => {
                  onConfirm(method, Number(amount));
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
