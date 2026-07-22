"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { TrackingStatusBadge } from "@/components/ui/status-badge";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">My Orders</h1>
        <p className="text-sm text-muted-foreground">
          {orders.length} order{orders.length === 1 ? "" : "s"}
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && isLoading && <TableSkeleton columns={4} />}

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
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const shipment = order.shipments[0];
              return (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">
                    {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <TrackingStatusBadge status={shipment?.currentStatus} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {shipment ? (
                      <Link
                        href={`/tracking?tracking=${shipment.internalTrackingNumber}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Track
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
