"use client";

import { useState, type ReactNode } from "react";
import type { QuoteRequest } from "@/lib/types/placeholder";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

export function GenerateQuoteDialog({
  trigger,
  onCreate,
}: {
  trigger: ReactNode;
  onCreate: (quote: QuoteRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim() || !origin.trim() || !destination.trim() || !weightKg) {
      setError("All fields are required.");
      return;
    }
    onCreate({
      id: `q_${crypto.randomUUID().slice(0, 8)}`,
      customerName: customerName.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      weightKg: Number(weightKg),
      reviewReason: null,
      status: "PENDING_REVIEW",
      quotedAmount: null,
      createdAt: new Date().toISOString(),
    });
    setOpen(false);
    setCustomerName("");
    setOrigin("");
    setDestination("");
    setWeightKg("");
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Generate quote"
          description="Creates a manual quote request for review."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="q-customer">Customer</Label>
              <Input
                id="q-customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-origin">Origin</Label>
                <Input id="q-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-destination">Destination</Label>
                <Input
                  id="q-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-weight">Weight (kg)</Label>
              <Input
                id="q-weight"
                type="number"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm">
                Create request
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
