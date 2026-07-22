"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, User } from "lucide-react";
import type { OrderDto, CustomerDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge, TrackingStatusBadge } from "@/components/ui/status-badge";

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [providers, setProviders] = useState<ShippingProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Refetching when the route param changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    apiClient
      .get<OrderDto>(`/orders/${params.id}`)
      .then(async (orderRes) => {
        if (cancelled) return;
        setOrder(orderRes);
        const [customerRes, providersRes] = await Promise.all([
          apiClient.get<CustomerDto>(`/customers/${orderRes.customerId}`),
          apiClient.get<ShippingProviderDto[]>("/shipping-providers"),
        ]);
        if (cancelled) return;
        setCustomer(customerRes);
        setProviders(providersRes);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Order not found."
            : "Failed to load this order.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const providerById = new Map(providers.map((p) => [p.id, p]));

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to orders
      </Link>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && order && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Order {order.id.slice(0, 8)}
              </h1>
              <p className="text-sm text-muted-foreground">
                Created {new Date(order.createdAt).toLocaleString()}
              </p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" aria-hidden />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customer ? (
                <div className="space-y-1 text-sm">
                  <Link
                    href={`/admin/customers/${customer.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {customer.name}
                  </Link>
                  <p className="text-muted-foreground">{customer.phone}</p>
                  {customer.email && <p className="text-muted-foreground">{customer.email}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Customer not found.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden />
                Shipments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.shipments.length === 0 && (
                <p className="text-sm text-muted-foreground">No shipments on this order.</p>
              )}
              {order.shipments.map((shipment) => {
                const provider = providerById.get(shipment.providerId);
                return (
                  <div
                    key={shipment.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <Link
                        href={`/admin/shipments?tracking=${shipment.internalTrackingNumber}`}
                        className="font-mono text-sm font-medium text-primary hover:underline"
                      >
                        {shipment.internalTrackingNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {provider?.name ?? "Unknown provider"}
                      </p>
                    </div>
                    <TrackingStatusBadge status={shipment.currentStatus} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
