"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil, Package, CreditCard, Truck, StickyNote } from "lucide-react";
import type { CustomerDto, OrderDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, EmptyState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { listMockPayments, listMockPickups } from "@/lib/mock-data";
import type { PaymentRecord, PickupRecord } from "@/lib/types/placeholder";

export default function AdminCustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [pickups, setPickups] = useState<PickupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Refetching when the route param changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<CustomerDto>(`/customers/${params.id}`),
      apiClient.get<OrderDto[]>("/orders"),
      listMockPayments(),
      listMockPickups(),
    ])
      .then(([customerRes, ordersRes, paymentsRes, pickupsRes]) => {
        if (cancelled) return;
        setCustomer(customerRes);
        setOrders(ordersRes.filter((o) => o.customerId === customerRes.id));
        setPayments(paymentsRes.filter((p) => p.customerName === customerRes.name));
        setPickups(pickupsRes.filter((p) => p.customerName === customerRes.name));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Customer not found."
            : "Failed to load this customer.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to customers
      </Link>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && customer && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">{customer.name}</h1>
              <p className="text-sm text-muted-foreground">
                Customer since {new Date(customer.createdAt).toLocaleDateString()}
              </p>
            </div>
            <EditCustomerDialog
              customer={customer}
              onUpdated={setCustomer}
              trigger={
                <Button variant="secondary" size="sm">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </Button>
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Personal information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="text-foreground">{customer.phone}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-foreground">{customer.email ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="text-foreground">{customer.address ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Consent</dt>
                  <dd className="text-foreground">
                    Given {new Date(customer.consentGivenAt).toLocaleDateString()} via{" "}
                    {customer.consentSource}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" aria-hidden />
                Shipment history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <EmptyState title="No orders yet" />
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center justify-between rounded-md border border-border p-3 hover:border-primary"
                    >
                      <span className="font-mono text-sm">
                        {order.shipments[0]?.internalTrackingNumber ?? order.id.slice(0, 8)}
                      </span>
                      <TrackingStatusBadge status={order.shipments[0]?.currentStatus} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" aria-hidden />
                Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <EmptyState title="No payment records" description="Placeholder data — no payment backend yet." />
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                    >
                      <span>
                        {p.orderId} — ₹{p.amount}
                      </span>
                      <Badge variant={p.status === "PAID" ? "success" : "warning"}>
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4" aria-hidden />
                Pickups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pickups.length === 0 ? (
                <EmptyState title="No pickup records" description="Placeholder data — no pickup backend yet." />
              ) : (
                <div className="space-y-2">
                  {pickups.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                    >
                      <span>
                        {p.date} · {p.timeSlot}
                      </span>
                      <Badge variant={p.status === "COMPLETED" ? "success" : "neutral"}>
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StickyNote className="h-4 w-4" aria-hidden />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Coming soon.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
