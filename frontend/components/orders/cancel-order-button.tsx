"use client";

import { useState } from "react";
import type { CancellationQuoteDto, OrderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

/**
 * A customer calling off their own order.
 *
 * Only offered while no AWB has been issued — after that the parcel is in a carrier's network and
 * stopping it is a support conversation. The fee is fetched and shown before the confirm button,
 * because a cancellation that silently costs money is how disputes start.
 */
export function CancelOrderButton({
  order,
  onCancelled,
}: {
  order: OrderDto;
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<CancellationQuoteDto | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const { showToast } = useToast();

  if (!order.isCancellableByCustomer) return null;

  async function openDialog() {
    setOpen(true);
    setQuote(null);
    setError(null);
    try {
      setQuote(
        await apiClient.get<CancellationQuoteDto>(
          `/orders/me/${order.id}/cancellation-quote`,
        ),
      );
    } catch (err) {
      setError(errorMessage(err, "Couldn't work out the cancellation fee."));
    }
  }

  async function confirm() {
    setIsCancelling(true);
    setError(null);
    try {
      await apiClient.post(`/orders/me/${order.id}/cancel`, {
        reason: reason.trim() || undefined,
      });
      showToast({ variant: "success", title: "Order cancelled" });
      setOpen(false);
      onCancelled();
    } catch (err) {
      setError(errorMessage(err, "Couldn't cancel this order."));
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openDialog}>
        Cancel order
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent
            title="Cancel this order"
            description="You can cancel until we hand the parcel to the carrier."
          >
            <div className="space-y-4 text-sm">
              {quote && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-muted-foreground">Cancellation fee</p>
                  <p className="text-lg font-semibold text-foreground">
                    ₹{quote.totalFee.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ₹{quote.baseFee.toLocaleString("en-IN")} base
                    {quote.distanceKm != null
                      ? ` + ₹${quote.perKmFee}/km for the ${quote.distanceKm} km ${
                          quote.distanceSource === "road" ? "drive" : "distance"
                        } to your pickup address`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {quote.distanceSource === "straight-line"
                      ? "Measured in a straight line — we could not reach the road network just now."
                      : ""}
                  </p>
                </div>
              )}
              {!quote && !error && <p className="text-muted-foreground">Checking…</p>}

              <div className="space-y-1.5">
                <Label htmlFor="customer-cancel-reason">Reason (optional)</Label>
                <Input
                  id="customer-cancel-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {error && <FieldError>{error}</FieldError>}

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
                  onClick={confirm}
                >
                  Cancel and pay ₹{quote?.totalFee.toLocaleString("en-IN") ?? "…"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
