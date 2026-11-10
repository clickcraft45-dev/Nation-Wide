"use client";

import { useState } from "react";
import type { OnlineCheckoutDto, OrderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Sends the customer to the UPI checkout for what this order owes.
 *
 * The amount on the label is for reading only. The server works out what to charge from the
 * order itself, so nothing typed or tampered with here changes it.
 */
export function PayOnlineButton({ order }: { order: OrderDto }) {
  const [isOpening, setIsOpening] = useState(false);
  const { showToast } = useToast();

  if (!order.dueAmount || order.dueAmount <= 0) return null;

  async function pay() {
    setIsOpening(true);
    try {
      const { checkoutUrl } = await apiClient.post<OnlineCheckoutDto>(
        `/online-payments/me/orders/${order.id}/checkout`,
        {},
      );
      // Left spinning on purpose: the page is about to be replaced by the checkout, and a button
      // that springs back to life in between gets pressed twice.
      window.location.assign(checkoutUrl);
    } catch (err) {
      showToast({
        variant: "error",
        title: errorMessage(err, "We couldn't open the payment page. Please try again."),
      });
      setIsOpening(false);
    }
  }

  return (
    <Button size="sm" isLoading={isOpening} onClick={pay}>
      Pay {rupees(order.dueAmount)}
    </Button>
  );
}
