"use client";

import { useEffect, useState } from "react";
import type { AdminOnlinePaymentDto, OnlinePaymentStatusCode } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils/format-date-time";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// What the gateway is claiming, in the office's words. None of these is "paid": the gateway reads
// bank alerts, and the admin reading this is the one who checks the account.
const GATEWAY_CLAIM: Partial<
  Record<OnlinePaymentStatusCode, { label: string; variant: BadgeProps["variant"] }>
> = {
  OBSERVED: { label: "Bank alert seen", variant: "info" },
  RECONCILED: { label: "Matched to statement", variant: "success" },
  MANUAL_REVIEW: { label: "Unclear, check carefully", variant: "warning" },
};

/**
 * Online payments the gateway has reported and nobody has ruled on yet.
 *
 * Renders nothing when there are none, so the Payments page looks exactly as it did on any day
 * without an online payment.
 */
export function OnlinePaymentsReview({ onChanged }: { onChanged: () => void }) {
  const [payments, setPayments] = useState<AdminOnlinePaymentDto[]>([]);
  const { showToast } = useToast();

  function load() {
    apiClient
      .get<AdminOnlinePaymentDto[]>("/admin/online-payments")
      .then(setPayments)
      // Quiet on failure: the orders table below reports its own, and one error is enough.
      .catch(() => setPayments([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function confirm(payment: AdminOnlinePaymentDto) {
    try {
      await apiClient.post(`/admin/online-payments/${payment.id}/confirm`, {});
      showToast({ variant: "success", title: "Payment confirmed and order marked paid" });
      load();
      onChanged();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't confirm this payment.") });
    }
  }

  if (payments.length === 0) return null;

  return (
    <section aria-labelledby="online-payments-heading" className="space-y-3">
      <div>
        <h2 id="online-payments-heading" className="text-base font-semibold text-foreground">
          Online payments to confirm
          <span className="ml-2 font-normal text-muted-foreground">{payments.length}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          A customer paid by UPI from their portal. Find the UTR in the bank statement, then
          confirm. Confirming marks the order paid and sends the receipt.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tracking</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>UTR</TableHead>
            <TableHead>Gateway says</TableHead>
            <TableHead>Reported</TableHead>
            <TableHead>Decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const claim = GATEWAY_CLAIM[payment.status];
            return (
              <TableRow key={payment.id} href={`/admin/orders/${payment.orderId}`}>
                <TableCell className="font-mono text-xs">
                  {payment.trackingNumber ?? payment.orderId.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <p>{payment.customerName ?? "Unknown"}</p>
                  {payment.customerPhone && (
                    <p className="text-xs text-muted-foreground">{payment.customerPhone}</p>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <p className="font-medium text-foreground">{rupees(payment.amount)}</p>
                  {/* Only said when it differs: that is the case the admin must not miss. */}
                  {payment.orderDueAmount !== payment.amount && (
                    <p className="text-xs text-warning">
                      Order now owes{" "}
                      {payment.orderDueAmount != null ? rupees(payment.orderDueAmount) : "nothing"}
                    </p>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{payment.utr ?? "Not given"}</TableCell>
                <TableCell>
                  <Badge variant={claim?.variant ?? "neutral"}>
                    {claim?.label ?? payment.status}
                  </Badge>
                  {payment.note && (
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">{payment.note}</p>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(payment.updatedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <ConfirmDialog
                      title={`Confirm ${rupees(payment.amount)} received?`}
                      description={`Only confirm after finding ${
                        payment.utr ? `UTR ${payment.utr}` : "this credit"
                      } in the bank statement. The order will be marked paid and the customer sent a receipt.`}
                      confirmLabel="Money is in the bank"
                      onConfirm={() => confirm(payment)}
                      trigger={<Button size="sm">Confirm</Button>}
                    />
                    <RejectDialog
                      payment={payment}
                      onRejected={() => {
                        load();
                        onChanged();
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

function RejectDialog({
  payment,
  onRejected,
}: {
  payment: AdminOnlinePaymentDto;
  onRejected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  const noteId = `reject-note-${payment.id}`;

  async function reject() {
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.post(`/admin/online-payments/${payment.id}/reject`, { note: note.trim() });
      showToast({ variant: "success", title: "Payment rejected" });
      setOpen(false);
      onRejected();
    } catch (err) {
      setError(errorMessage(err, "Couldn't reject this payment."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Reject
      </Button>
      {open && (
        <DialogContent
          title="Reject this payment"
          description={`${rupees(payment.amount)} from ${
            payment.customerName ?? "this customer"
          }. The order stays unpaid and they can pay again.`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={noteId}>Reason</Label>
              <Input
                id={noteId}
                placeholder="What the bank statement showed"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="danger"
                size="sm"
                isLoading={isSaving}
                disabled={note.trim().length < 3}
                onClick={reject}
              >
                Reject payment
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
