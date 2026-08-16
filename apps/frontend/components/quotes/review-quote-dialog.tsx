"use client";

import { useState, type ReactNode } from "react";
import type { QuoteAdminDetailDto } from "@nationwide/shared-types";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const CURRENCIES = ["INR", "USD"];

export function ReviewQuoteDialog({
  trigger,
  quote,
  onQuoted,
  onReject,
}: {
  trigger: ReactNode;
  quote: QuoteAdminDetailDto;
  onQuoted: (amount: number, currency: string, internalNotes: string) => void;
  onReject: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState(quote.internalNotes ?? "");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Review quote request"
          description={`${quote.customerName} — ${quote.origin ? `${quote.origin.city} → ` : "To "}${quote.destination.city}, ${quote.weightKg}kg`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p>{quote.shipmentType.charAt(0) + quote.shipmentType.slice(1).toLowerCase()}</p>
              {quote.description && <p>{quote.description}</p>}
              {quote.reviewReason && (
                <p className="text-warning">
                  Flagged for manual review: {quote.reviewReason.replace(/_/g, " ").toLowerCase()}
                </p>
              )}
            </div>

            {!showReject ? (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="quote-amount">Quoted amount</Label>
                    <Input
                      id="quote-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Required to send"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quote-currency">Currency</Label>
                    <NativeSelect
                      id="quote-currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quote-notes">Internal notes (not shown to customer)</Label>
                  <Input
                    id="quote-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setShowReject(true)}
                  >
                    Reject…
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" size="sm">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    size="sm"
                    disabled={!amount}
                    onClick={() => {
                      onQuoted(Number(amount), currency, notes.trim());
                      setOpen(false);
                    }}
                  >
                    Send quote
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="reject-reason">Reason for rejecting</Label>
                  <Input
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Shown to the customer"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowReject(false)}
                  >
                    Back
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!rejectReason.trim()}
                    onClick={() => {
                      onReject(rejectReason.trim());
                      setOpen(false);
                    }}
                  >
                    Confirm reject
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
