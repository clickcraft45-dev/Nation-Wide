"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CouponDto, OrderDto, PaymentMethodCode } from "@nationwide/shared-types";
import { isCouponUsable } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const METHODS: { value: PaymentMethodCode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
];

export interface MarkPaidDetails {
  method: PaymentMethodCode;
  amount: number;
  payerName?: string;
  note?: string;
  /** A discount code to apply. The server re-checks it — this is only what was typed. */
  couponCode?: string;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Recording a payment, with who it came from.
 *
 * Cash and UPI arrive from whoever happens to be at the door — a relative, an office manager, a
 * driver — and the question "who actually paid this" is the one asked weeks later when the
 * customer disputes it. So the payer and a free-text note are collected at the moment the money
 * is recorded, not reconstructed afterwards from memory.
 */
export function MarkPaidDialog({
  trigger,
  order,
  onConfirm,
}: {
  trigger: ReactNode;
  order: OrderDto;
  onConfirm: (details: MarkPaidDetails) => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethodCode>("CASH");
  const [amount, setAmount] = useState(order.paidAmount?.toString() ?? "");
  const [payerName, setPayerName] = useState(order.customerName ?? "");
  const [note, setNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  // The live codes, fetched once the dialog is actually opened. Only ever used to preview what a
  // code takes off — the server validates and redeems it when the payment is recorded, so a
  // stale list here cannot apply a discount that is no longer real.
  const [coupons, setCoupons] = useState<CouponDto[]>([]);

  useEffect(() => {
    if (!open || coupons.length > 0) return;
    apiClient
      .get<CouponDto[]>("/admin/coupons")
      .then(setCoupons)
      .catch(() => setCoupons([]));
  }, [open, coupons.length]);

  const typedCode = couponCode.trim().toUpperCase();
  const matchedCoupon = coupons.find((c) => c.code === typedCode);
  const usableCoupon = matchedCoupon && isCouponUsable(matchedCoupon) ? matchedCoupon : null;
  const discount = usableCoupon?.discountAmount ?? 0;
  const payable = Math.max(Number(amount || 0) - discount, 0);

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
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Coupon code (optional)</Label>
              <Input
                id="coupon-code"
                placeholder="DIWALI500"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
              {typedCode && !usableCoupon && (
                <p className="text-xs text-destructive">
                  {matchedCoupon
                    ? "That code is retired, expired or fully used."
                    : "No live coupon with that code."}
                </p>
              )}
              {usableCoupon && (
                <p className="text-xs text-muted-foreground">
                  {rupees(discount)} off — {rupees(payable)} to collect.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payer-name">Paid by</Label>
              <Input
                id="payer-name"
                placeholder="Who handed the money over"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-note">Note</Label>
              <Input
                id="payment-note"
                placeholder="UPI ref, part payment, anything worth recording"
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
                  onConfirm({
                    method,
                    // The amount is the money that actually changed hands, so a discount comes
                    // off it rather than being recorded alongside the full price.
                    amount: usableCoupon ? payable : Number(amount),
                    payerName: payerName.trim() || undefined,
                    note: note.trim() || undefined,
                    couponCode: usableCoupon ? usableCoupon.code : undefined,
                  });
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
