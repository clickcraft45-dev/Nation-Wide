"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, User } from "lucide-react";
import type {
  OrderDto,
  CustomerDto,
  ShippingProviderDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { ShipmentAwbCard } from "@/components/orders/shipment-awb-card";
import { OrderTrackingPanel } from "@/components/orders/order-tracking-panel";

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [providers, setProviders] = useState<ShippingProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumped after an AWB is mapped so the effect below refetches and the card redraws with the
  // new number, rather than the page holding a stale copy until a manual reload.
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [params.id, reloadKey]);

  return (
    <div className="max-w-6xl space-y-6">
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

          {/* Two columns from lg up: the order's own record on the left, where it lives now, and
              the parcel's journey on the right. Below lg they stack and the tracking rail lands
              under the shipments it describes. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-6">
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
                      {customer.email && (
                        <p className="text-muted-foreground">
                          {customer.email}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Customer not found.
                    </p>
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
                <CardContent className="space-y-5">
                  {order.shipments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No shipments on this order.
                    </p>
                  )}
                  {order.shipments.map((shipment) => (
                    <ShipmentAwbCard
                      key={shipment.id}
                      shipment={shipment}
                      providers={providers}
                      customerName={customer?.name ?? order.customerName}
                      destination={order.destination}
                      onMapped={() => setReloadKey((k) => k + 1)}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Sticky, because the left column is the long one — the journey should stay on
                screen while an admin scrolls a multi-shipment order. */}
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <OrderTrackingPanel shipments={order.shipments} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
