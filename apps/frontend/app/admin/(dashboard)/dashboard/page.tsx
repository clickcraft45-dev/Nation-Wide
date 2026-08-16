"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  CreditCard,
  CalendarClock,
  Users,
  FileQuestion,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type {
  OrderDto,
  CustomerDto,
  AuditLogEntryDto,
  DashboardSummaryDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { OrdersOverviewChart, type OrdersOverviewPoint } from "@/components/dashboard/orders-overview-chart";
import { ShipmentStatusDonut, type ShipmentStatusSlice } from "@/components/dashboard/shipment-status-donut";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";

function displayName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  const firstSegment = localPart.split(/[._-]/)[0] ?? localPart;
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

const IN_TRANSIT_STATUSES = new Set(["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"]);
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AdminDashboardHomePage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<OrderDto[]>("/orders"),
      apiClient.get<CustomerDto[]>("/customers"),
      apiClient.get<AuditLogEntryDto[]>("/admin/audit-logs"),
      apiClient.get<DashboardSummaryDto>("/admin/dashboard-summary"),
    ])
      .then(([ordersRes, customersRes, auditRes, summaryRes]) => {
        if (cancelled) return;
        setOrders(ordersRes);
        setCustomers(customersRes);
        setAuditLogs(auditRes);
        setSummary(summaryRes);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? "Failed to load dashboard data."
            : "Something went wrong loading the dashboard.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers ?? []) map.set(c.id, c.name);
    return map;
  }, [customers]);

  const primaryStatus = (order: OrderDto) => order.shipments[0]?.currentStatus ?? null;
  const ordersInTransit =
    orders?.filter((o) => IN_TRANSIT_STATUSES.has(primaryStatus(o) ?? "")).length ?? 0;
  const ordersDelivered = orders?.filter((o) => primaryStatus(o) === "DELIVERED").length ?? 0;
  const totalShipments = orders?.reduce((sum, o) => sum + o.shipments.length, 0) ?? 0;
  const totalRevenue =
    orders
      ?.filter((o) => o.paymentStatus === "PAID")
      .reduce((sum, o) => sum + (o.paidAmount ?? 0), 0) ?? 0;

  const ordersOverview: OrdersOverviewPoint[] = useMemo(() => {
    const days: OrdersOverviewPoint[] = [];
    const counts = new Map<string, number>();
    for (const o of orders ?? []) {
      const key = o.createdAt.slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ label: WEEKDAY_LABELS[d.getDay()], value: counts.get(key) ?? 0 });
    }
    return days;
  }, [orders]);

  const shipmentStatusSlices: ShipmentStatusSlice[] = useMemo(() => {
    let delivered = 0;
    let inTransit = 0;
    let exception = 0;
    let pending = 0;
    for (const o of orders ?? []) {
      for (const s of o.shipments) {
        if (s.currentStatus === "DELIVERED") delivered++;
        else if (IN_TRANSIT_STATUSES.has(s.currentStatus ?? "")) inTransit++;
        else if (s.currentStatus === "EXCEPTION") exception++;
        else pending++;
      }
    }
    // Ordered so the two brand status colors that sit too close for full CVD separation
    // (Warning/Danger) are opposite each other on the ring, never touching — see the
    // component's own comment for the underlying check.
    return [
      { key: "delivered", label: "Delivered", value: delivered, colorVar: "--color-success", icon: CheckCircle2 },
      { key: "pending", label: "Pending", value: pending, colorVar: "--color-warning", icon: Clock },
      { key: "in-transit", label: "In Transit", value: inTransit, colorVar: "--color-info", icon: Truck },
      { key: "exception", label: "Exception", value: exception, colorVar: "--color-danger", icon: AlertTriangle },
    ];
  }, [orders]);

  const recentOrders = useMemo(
    () => [...(orders ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [orders],
  );

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back, {user ? displayName(user.email) : "there"}.
        </h1>
        <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard title="Total Orders" value={orders?.length ?? 0} icon={Package} href="/admin/orders" isLoading={isLoading} />
        <KpiCard title="Total Shipments" value={totalShipments} icon={Truck} href="/admin/shipments" isLoading={isLoading} />
        <KpiCard
          title="Total Revenue"
          value={`₹${Math.round(totalRevenue).toLocaleString("en-IN")}`}
          icon={CreditCard}
          href="/admin/payments"
          isLoading={isLoading}
        />
        <KpiCard
          title="Scheduled Pickups"
          value={summary?.scheduledPickups ?? 0}
          icon={Clock}
          href="/admin/pickup-requests"
          isLoading={isLoading}
        />
        <KpiCard
          title="Pending Payments"
          value={summary?.pendingPayments ?? 0}
          icon={CreditCard}
          href="/admin/payments"
          isLoading={isLoading}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Quick actions</h2>
        <QuickActions />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Orders Overview — last 7 days</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-48 w-full" /> : <OrdersOverviewChart data={ordersOverview} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : recentOrders.length === 0 ? (
                <EmptyState icon={<Package className="h-8 w-8" aria-hidden />} title="No orders yet" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                        <TableCell>{customerNameById.get(order.customerId) ?? "—"}</TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell>{new Date(order.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>
                          {order.paidAmount !== null ? `₹${Math.round(order.paidAmount).toLocaleString("en-IN")}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            View <ArrowRight className="h-3 w-3" aria-hidden />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shipment Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-32 w-full" /> : <ShipmentStatusDonut slices={shipmentStatusSlices} />}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Orders Delivered" value={ordersDelivered} icon={CheckCircle2} href="/admin/orders?status=delivered" isLoading={isLoading} />
            <KpiCard title="Orders In Transit" value={ordersInTransit} icon={Truck} href="/admin/orders?status=in-transit" isLoading={isLoading} />
            <KpiCard title="Total Customers" value={customers?.length ?? 0} icon={Users} href="/admin/customers" isLoading={isLoading} />
            <KpiCard
              title="Warehouse Drop-offs"
              value={summary?.dropOffs ?? 0}
              icon={CalendarClock}
              href="/admin/pickup-requests"
              isLoading={isLoading}
            />
            <KpiCard
              title="Quote Requests"
              value={summary?.newQuotes ?? 0}
              icon={FileQuestion}
              href="/admin/quotes"
              hint={summary?.needsManualReview ? `${summary.needsManualReview} need review` : undefined}
              isLoading={isLoading}
            />
          </div>

          <RecentActivity entries={auditLogs} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
