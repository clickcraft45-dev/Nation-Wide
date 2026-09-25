"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import type { CancellationQuoteDto, OrderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { PaymentStatusBadge } from "@/components/ui/status-badge";
import { RefundDialog } from "@/components/payments/refund-dialog";
import { useToast } from "@/components/ui/toast";

function money(amount: number | null): string {
  return amount == null ? "—" : `₹${amount.toLocaleString("en-IN")}`;
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN") : "—";
}

/**
 * The money on this order: what was charged, who paid it, what went back, and what cancelling
 * cost. Cancellation sits here rather than beside the status badge because the fee is the part
 * anyone actually argues about.
 */
export function OrderPaymentCard({
  order,
  onChanged,
}: {
  order: OrderDto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<CancellationQuoteDto | null>(null);
  const [reason, setReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const { showToast } = useToast();

  async function openCancel() {
    setOpen(true);
    setQuote(null);
    try {
      setQuote(
        await apiClient.get<CancellationQuoteDto>(
          `/admin/orders/${order.id}/cancellation-quote`,
        ),
      );
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't price the cancellation.") });
      setOpen(false);
    }
  }

  async function recordRefund(amount: number, note?: string) {
    try {
      await apiClient.patch(`/admin/orders/${order.id}/payment`, {
        paymentStatus: "REFUNDED",
        refundedAmount: amount,
        refundNote: note,
      });
      showToast({ variant: "success", title: "Refund recorded" });
      onChanged();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't record the refund.") });
    }
  }

  async function confirmCancel() {
    setIsCancelling(true);
    try {
      await apiClient.post(`/admin/orders/${order.id}/cancel`, {
        reason: reason.trim() || undefined,
      });
      showToast({ variant: "success", title: "Order cancelled" });
      setOpen(false);
      onChanged();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't cancel this order.") });
    } finally {
      setIsCancelling(false);
    }
  }

  const rows: { label: string; value: string }[] = [
    { label: "Amount paid", value: money(order.paidAmount) },
    { label: "Method", value: order.paymentMethod ?? "—" },
    { label: "Paid at", value: when(order.paidAt) },
    { label: "Paid by", value: order.paymentPayerName ?? "—" },
  ];
  if (order.refundedAmount != null) {
    rows.push(
      { label: "Refunded", value: money(order.refundedAmount) },
      { label: "Refunded at", value: when(order.refundedAt) },
    );
  }
  // Money already taken, minus the fee the cancellation charged. Surfaced rather than refunded
  // automatically: there is no gateway here, so the money moves by hand and the app should say
  // what is owed, not claim it has been sent.
  const refundDue =
    order.cancelledAt &&
    order.paymentStatus === "PAID" &&
    order.paidAmount != null
      ? Math.max(order.paidAmount - (order.cancellationFee ?? 0), 0)
      : null;

  if (order.cancelledAt) {
    rows.push(
      { label: "Cancelled", value: when(order.cancelledAt) },
      { label: "Cancellation fee", value: money(order.cancellationFee) },
      {
        label: "Distance charged",
        value:
          order.cancellationDistanceKm != null
            ? `${order.cancellationDistanceKm} km ${
                order.cancellationDistanceSource === "road"
                  ? "by road"
                  : "straight-line"
              }`
            : "Not measurable",
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" aria-hidden />
          Payment
        </CardTitle>
        <PaymentStatusBadge status={order.paymentStatus} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>

        {order.paymentNote && (
          <div>
            <p className="text-muted-foreground">Note</p>
            <p className="text-foreground">{order.paymentNote}</p>
          </div>
        )}
        {order.refundNote && (
          <div>
            <p className="text-muted-foreground">Refund note</p>
            <p className="text-foreground">{order.refundNote}</p>
          </div>
        )}
        {order.cancellationReason && (
          <div>
            <p className="text-muted-foreground">Cancellation reason</p>
            <p className="text-foreground">{order.cancellationReason}</p>
          </div>
        )}

        {refundDue != null && refundDue > 0 && (
          <div className="rounded-lg border border-warning-border bg-warning-bg p-3">
            <p className="text-muted-foreground">Refund due</p>
            <p className="font-semibold text-foreground">{money(refundDue)}</p>
            <p className="text-xs text-muted-foreground">
              {money(order.paidAmount)} paid less the {money(order.cancellationFee)} cancellation
              charge. Record it once the money has actually gone back.
            </p>
            <div className="mt-2">
              <RefundDialog
                order={order}
                defaultAmount={refundDue}
                onConfirm={recordRefund}
                trigger={
                  <Button variant="secondary" size="sm">
                    Record refund
                  </Button>
                }
              />
            </div>
          </div>
        )}

        {order.isCancellableByCustomer && (
          <Button variant="secondary" size="sm" onClick={openCancel}>
            Cancel order
          </Button>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent
            title="Cancel this order"
            description="Cancelling is only possible while no AWB has been issued."
          >
            <div className="space-y-4 text-sm">
              {quote ? (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-muted-foreground">Cancellation fee</p>
                  <p className="text-lg font-semibold text-foreground">
                    ₹{quote.totalFee.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ₹{quote.baseFee.toLocaleString("en-IN")} base
                    {quote.distanceKm != null
                      ? ` + ₹${quote.perKmFee}/km × ${quote.distanceKm} km ${
                          quote.distanceSource === "road"
                            ? "by road from the warehouse"
                            : "straight-line from the warehouse (road network unreachable)"
                        }`
                      : " — no pickup coordinates, so no distance is charged"}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">Working out the fee…</p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">Reason (optional)</Label>
                <Input
                  id="cancel-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="sm">
                    Keep order
                  </Button>
                </DialogClose>
                <Button
                  size="sm"
                  isLoading={isCancelling}
                  disabled={!quote?.isCancellable}
                  onClick={confirmCancel}
                >
                  Cancel order
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
