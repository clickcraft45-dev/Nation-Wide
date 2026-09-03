"use client";

import { useState, type ReactNode } from "react";
import type { CustomerDto, OrderDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

export function CreateOrderDialog({
  trigger,
  customers,
  providers,
  onCreated,
}: {
  trigger: ReactNode;
  customers: CustomerDto[];
  providers: ShippingProviderDto[];
  onCreated: (order: OrderDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const order = await apiClient.post<OrderDto>("/orders", {
        customerId,
        ...(providerCode ? { providerCode } : {}),
      });
      showToast({ variant: "success", title: "Order created" });
      onCreated(order);
      setOpen(false);
      setCustomerId("");
      setProviderCode("");
    } catch {
      setError("Failed to create the order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Create order"
          description="Creates an order and generates a NationWide tracking number for the shipment."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="customerId">Customer</Label>
              <NativeSelect
                id="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="providerCode">Provider (optional)</Label>
              <NativeSelect
                id="providerCode"
                value={providerCode}
                onChange={(e) => setProviderCode(e.target.value)}
              >
                <option value="">Default</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                Create order
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
