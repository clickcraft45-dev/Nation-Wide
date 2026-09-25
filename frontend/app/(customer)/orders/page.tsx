"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import type { OrderDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
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

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<OrderDto[]>("/orders/me")
      .then(setOrders)
      .catch(() => setError("Failed to load your orders."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

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
            These parcels were collected on an agreed pay-later. Settle at the office or with
            whoever collected the parcel.
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
                    {new Date(order.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {order.dueAmount ? (
                      <span className="font-medium text-foreground">
                        {rupees(order.dueAmount)}
                      </span>
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
