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
  PickupRequestDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { TrendAreaChart, type TrendPoint } from "@/components/ui/trend-area-chart";
import { ShipmentStatusDonut, type ShipmentStatusSlice } from "@/components/dashboard/shipment-status-donut";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, formatIsoLong, todayIso, toIso } from "@/components/ui/calendar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

function displayName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  const firstSegment = localPart.split(/[._-]/)[0] ?? localPart;
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

const IN_TRANSIT_STATUSES = new Set(["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"]);
// Pickups still on the board — cancelled/rejected/completed ones aren't workload any more.
const NON_TERMINAL_PICKUP = new Set([
  "PENDING_ASSIGNMENT",
  "ASSIGNED",
  "SCHEDULED",
  "OUT_FOR_PICKUP",
  "VERIFICATION_PENDING",
]);
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The trend panel's own range control.
const TREND_RANGES = [
  { days: 90, label: "Last 3 months" },
  { days: 30, label: "Last 30 days" },
  { days: 7, label: "Last 7 days" },
] as const;

const TREND_SERIES = [
  { key: "orders", label: "In progress" },
  { key: "delivered", label: "Delivered" },
];

export default function AdminDashboardHomePage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [pickupRequests, setPickupRequests] = useState<PickupRequestDto[]>([]);
  const [scheduleDay, setScheduleDay] = useState(todayIso);
  const [trendDays, setTrendDays] = useState<number>(90);
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
      apiClient.get<PickupRequestDto[]>("/admin/pickup-requests"),
    ])
      .then(([ordersRes, customersRes, auditRes, summaryRes, pickupsRes]) => {
        if (cancelled) return;
        setOrders(ordersRes);
        setCustomers(customersRes);
        setAuditLogs(auditRes);
        setSummary(summaryRes);
        setPickupRequests(pickupsRes);
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

  // Two stacked series per day: what is still moving, and what already landed. "Delivered" is
  // counted against the day the order was PLACED, not the day it arrived — the API carries no
  // delivery timestamp, and dating both series the same way is what lets them stack honestly.
  const ordersTrend: TrendPoint[] = useMemo(() => {
    const placed = new Map<string, number>();
    const delivered = new Map<string, number>();
    for (const o of orders ?? []) {
      const key = o.createdAt.slice(0, 10);
      placed.set(key, (placed.get(key) ?? 0) + 1);
      if (o.shipments[0]?.currentStatus === "DELIVERED") {
        delivered.set(key, (delivered.get(key) ?? 0) + 1);
      }
    }

    const points: TrendPoint[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toIso(d);
      const deliveredCount = delivered.get(key) ?? 0;
      points.push({
        label:
          trendDays <= 7
            ? WEEKDAY_LABELS[d.getDay()]
            : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        orders: Math.max(0, (placed.get(key) ?? 0) - deliveredCount),
        delivered: deliveredCount,
      });
    }
    return points;
  }, [orders, trendDays]);

  // The selected window against the one immediately before it — the KPI tiles' delta badges.
  const trendDelta = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - trendDays);
    const previousStart = new Date();
    previousStart.setDate(previousStart.getDate() - trendDays * 2);
    const startIso = toIso(start);
    const previousStartIso = toIso(previousStart);

    const inWindow = (from: string, to: string) =>
      (orders ?? []).filter(
        (o) => o.createdAt.slice(0, 10) >= from && o.createdAt.slice(0, 10) < to,
      );

    const current = inWindow(startIso, "9999-12-31");
    const previous = inWindow(previousStartIso, startIso);
    // No previous activity means no percentage exists — a bare "+100%" off zero is noise.
    const percent = (now: number, before: number) =>
      before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10;
    const revenueOf = (rows: OrderDto[]) =>
      rows.filter((o) => o.paymentStatus === "PAID").reduce((sum, o) => sum + (o.paidAmount ?? 0), 0);

    return {
      orders: percent(current.length, previous.length),
      revenue: percent(revenueOf(current), revenueOf(previous)),
      shipments: percent(
        current.reduce((sum, o) => sum + o.shipments.length, 0),
        previous.reduce((sum, o) => sum + o.shipments.length, 0),
      ),
    };
  }, [orders, trendDays]);

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

  // Pickup load per calendar day — the dots under each date, so dispatch can see a pile-up
  // before it happens rather than after.
  const pickupsByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of pickupRequests) {
      if (p.pickupDate && NON_TERMINAL_PICKUP.has(p.status)) {
        counts[p.pickupDate] = (counts[p.pickupDate] ?? 0) + 1;
      }
    }
    return counts;
  }, [pickupRequests]);

  const dayPickups = useMemo(
    () => pickupRequests.filter((p) => p.pickupDate === scheduleDay),
    [pickupRequests, scheduleDay],
  );
  const dayUnassigned = dayPickups.filter((p) => p.status === "PENDING_ASSIGNMENT").length;
  const dayValue = dayPickups.reduce((sum, p) => sum + p.estimatedPrice, 0);

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
        <KpiCard
          title="Total Orders"
          value={orders?.length ?? 0}
          icon={Package}
          href="/admin/orders"
          isLoading={isLoading}
          deltaPercent={trendDelta.orders}
          deltaLabel="versus the previous period"
        />
        <KpiCard
          title="Total Shipments"
          value={totalShipments}
          icon={Truck}
          href="/admin/shipments"
          isLoading={isLoading}
          deltaPercent={trendDelta.shipments}
          deltaLabel="versus the previous period"
        />
        <KpiCard
          title="Total Revenue"
          value={`₹${Math.round(totalRevenue).toLocaleString("en-IN")}`}
          icon={CreditCard}
          href="/admin/payments"
          isLoading={isLoading}
          deltaPercent={trendDelta.revenue}
          deltaLabel="versus the previous period"
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
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Orders Overview</CardTitle>
                <p className="text-2xl font-semibold text-foreground">
                  {ordersTrend.reduce((sum, p) => sum + Number(p.orders) + Number(p.delivered), 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Orders placed, {TREND_RANGES.find((r) => r.days === trendDays)?.label.toLowerCase()}
                </p>
              </div>
              <div className="flex shrink-0 rounded-lg border border-border p-0.5">
                {TREND_RANGES.map((range) => (
                  <button
                    key={range.days}
                    type="button"
                    onClick={() => setTrendDays(range.days)}
                    aria-pressed={trendDays === range.days}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      trendDays === range.days
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <TrendAreaChart
                  data={ordersTrend}
                  series={TREND_SERIES}
                  caption="Orders in progress and delivered, per day"
                />
              )}
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
          {isLoading ? (
            <Skeleton className="h-104 w-full rounded-2xl" />
          ) : (
            <Calendar
              title="Pickup Schedule"
              subtitle="Dots show pickups booked that day"
              markers={pickupsByDay}
              markerLabel="pickups booked"
              selected={scheduleDay}
              onSelect={setScheduleDay}
              className="max-w-none"
              footer={
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{formatIsoLong(scheduleDay)}</p>
                  {dayPickups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No pickups booked for this day.</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {dayPickups.length} pickup{dayPickups.length === 1 ? "" : "s"} ·{" "}
                        {dayUnassigned} awaiting a partner · ₹
                        {Math.round(dayValue).toLocaleString("en-IN")} booked value
                      </p>
                      <Link
                        href="/admin/pickup-requests"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open pickup requests <ArrowRight className="h-3 w-3" aria-hidden />
                      </Link>
                    </>
                  )}
                </div>
              }
            />
          )}

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
