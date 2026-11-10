"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import {
  ONLINE_PAYMENT_AWAITING_REVIEW,
  type MyOnlinePaymentsDto,
  type OrderDto,
} from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils/format-date-time";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { OrderStatusBadge, TrackingStatusBadge } from "@/components/ui/status-badge";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { PayOnlineButton } from "@/components/orders/pay-online-button";

const NO_ONLINE_PAYMENTS: MyOnlinePaymentsDto = { enabled: false, payments: [] };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<MyOnlinePaymentsDto>(NO_ONLINE_PAYMENTS);
  const [cameBackFromCheckout, setCameBackFromCheckout] = useState(false);

  const load = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<OrderDto[]>("/orders/me")
      .then(setOrders)
      .catch(() => setError("Failed to load your orders."))
      .finally(() => setIsLoading(false));
    // Paying online is an extra on this page. If it cannot be loaded the orders still show, just
    // without the button.
    apiClient
      .get<MyOnlinePaymentsDto>("/online-payments/me")
      .then(setOnline)
      .catch(() => setOnline(NO_ONLINE_PAYMENTS));
  };

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    // The checkout sends the customer back here with ?payment=<order id>. That says they left
    // the checkout, not that they paid, so it only earns a note about what happens next. The
    // parameter is then dropped so a refresh does not show the note again.
    const url = new URL(window.location.href);
    if (url.searchParams.has("payment")) {
      setCameBackFromCheckout(true);
      url.searchParams.delete("payment");
      window.history.replaceState(null, "", url);
    }
  }, []);

  const confirmingOrderIds = new Set(
    online.payments
      .filter((payment) => ONLINE_PAYMENT_AWAITING_REVIEW.includes(payment.status))
      .map((payment) => payment.orderId),
  );

  const dueOrders = orders.filter((order) => (order.dueAmount ?? 0) > 0);
  const totalDue = dueOrders.reduce((sum, order) => sum + (order.dueAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">My Orders</h1>
        <p className="text-sm text-muted-foreground">
          {orders.length} order{orders.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Money owed is the one thing on this page that needs answering, so it is said once at the
          top as a total, and again per order in the table below. */}
      {totalDue > 0 && (
        <div className="glass rounded-2xl p-4 text-sm">
          <p className="font-medium text-foreground">
            {rupees(totalDue)} due across {dueOrders.length} order
            {dueOrders.length === 1 ? "" : "s"}
          </p>
          <p className="text-muted-foreground">
            {online.enabled
              ? "These parcels were collected on an agreed pay-later. Pay by UPI from the list below, or settle at the office or with whoever collected the parcel."
              : "These parcels were collected on an agreed pay-later. Settle at the office or with whoever collected the parcel."}
          </p>
        </div>
      )}

      {cameBackFromCheckout && (
        <div className="glass rounded-2xl p-4 text-sm" role="status">
          <p className="font-medium text-foreground">Thank you. We are checking your payment.</p>
          <p className="text-muted-foreground">
            If you completed the UPI payment, we mark the order paid once the money shows in our
            bank account, and send your receipt on WhatsApp. If you did not pay, nothing has been
            charged and you can try again.
          </p>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && isLoading && <TableSkeleton columns={5} />}

      {!error && !isLoading && orders.length === 0 && (
        <EmptyState
          icon={<Package className="h-8 w-8" aria-hidden />}
          title="No orders yet"
          description="Your orders will show up here once you place one."
        />
      )}

      {!error && !isLoading && orders.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tracking Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Amount due</TableHead>
              <TableHead>Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const shipment = order.shipments[0];
              return (
                <TableRow
                  key={order.id}
                  href={
                    shipment
                      ? `/tracking?tracking=${shipment.internalTrackingNumber}`
                      : undefined
                  }
                >
                  <TableCell className="font-mono text-xs">
                    {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <TrackingStatusBadge status={shipment?.currentStatus} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {order.dueAmount ? (
                      // Once a payment is in for checking, the button gives way to saying so:
                      // offering it again is how an order gets paid twice.
                      confirmingOrderIds.has(order.id) ? (
                        <div>
                          <p className="font-medium text-foreground">{rupees(order.dueAmount)}</p>
                          <p className="text-xs text-muted-foreground">
                            Payment being confirmed
                          </p>
                        </div>
                      ) : online.enabled ? (
                        <PayOnlineButton order={order} />
                      ) : (
                        <span className="font-medium text-foreground">
                          {rupees(order.dueAmount)}
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Cancelling is only offered before an AWB exists; afterwards the badge is
                        the whole story. */}
                    {order.isCancellableByCustomer ? (
                      <CancelOrderButton order={order} onCancelled={load} />
                    ) : (
                      <OrderStatusBadge status={order.status} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
