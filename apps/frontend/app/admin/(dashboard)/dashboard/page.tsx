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
  DashboardSummaryDto,
  PickupRequestDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { TrendAreaChart, type TrendPoint } from "@/components/ui/trend-area-chart";
import { ShipmentStatusDonut, type ShipmentStatusSlice } from "@/components/dashboard/shipment-status-donut";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, addDaysIso, formatIsoLong, fromIso, todayIso } from "@/components/ui/calendar";
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

// Shortcuts that just write into the from/to pair below — the two dates are the single source
// of truth for the whole page, not a second filtering mode running alongside the presets.
const RANGE_PRESETS = [
  { days: 90, label: "3 months" },
  { days: 30, label: "30 days" },
  { days: 7, label: "7 days" },
] as const;

/** Whole days covered by an inclusive from..to pair, floored at 1. */
function daysBetween(from: string, to: string): number {
  const ms = fromIso(to).getTime() - fromIso(from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

const TREND_SERIES = [
  { key: "orders", label: "In progress" },
  { key: "delivered", label: "Delivered" },
];

export default function AdminDashboardHomePage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [pickupRequests, setPickupRequests] = useState<PickupRequestDto[]>([]);
  const [scheduleDay, setScheduleDay] = useState(todayIso);
  // The page-wide reporting window. Everything derived from orders below — KPIs, their deltas,
  // the trend chart and the recent-orders table — reads these two dates and nothing else.
  const [to, setTo] = useState(todayIso);
  const [from, setFrom] = useState(() => addDaysIso(todayIso(), -89));
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
      apiClient.get<DashboardSummaryDto>("/admin/dashboard-summary"),
      apiClient.get<PickupRequestDto[]>("/admin/pickup-requests"),
    ])
      .then(([ordersRes, customersRes, summaryRes, pickupsRes]) => {
        if (cancelled) return;
        setOrders(ordersRes);
        setCustomers(customersRes);
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

  const rangeDays = daysBetween(from, to);

  // Every KPI, delta and table below counts only what was placed inside the selected window.
  // Filtering here rather than at each call site is what keeps the tiles and the chart agreeing
  // with each other — they were previously all-time while the chart was windowed.
  const rangeOrders = useMemo(
    () => (orders ?? []).filter((o) => o.createdAt.slice(0, 10) >= from && o.createdAt.slice(0, 10) <= to),
    [orders, from, to],
  );

  const primaryStatus = (order: OrderDto) => order.shipments[0]?.currentStatus ?? null;
  const ordersInTransit = rangeOrders.filter((o) =>
    IN_TRANSIT_STATUSES.has(primaryStatus(o) ?? ""),
  ).length;
  const ordersDelivered = rangeOrders.filter((o) => primaryStatus(o) === "DELIVERED").length;
  const totalShipments = rangeOrders.reduce((sum, o) => sum + o.shipments.length, 0);
  const totalRevenue = rangeOrders
    .filter((o) => o.paymentStatus === "PAID")
    .reduce((sum, o) => sum + (o.paidAmount ?? 0), 0);

  // Two stacked series per day: what is still moving, and what already landed. "Delivered" is
  // counted against the day the order was PLACED, not the day it arrived — the API carries no
  // delivery timestamp, and dating both series the same way is what lets them stack honestly.
  const ordersTrend: TrendPoint[] = useMemo(() => {
    const placed = new Map<string, number>();
    const delivered = new Map<string, number>();
    for (const o of rangeOrders) {
      const key = o.createdAt.slice(0, 10);
      placed.set(key, (placed.get(key) ?? 0) + 1);
      if (o.shipments[0]?.currentStatus === "DELIVERED") {
        delivered.set(key, (delivered.get(key) ?? 0) + 1);
      }
    }

    const points: TrendPoint[] = [];
    for (let i = 0; i < rangeDays; i++) {
      const key = addDaysIso(from, i);
      const d = fromIso(key);
      const deliveredCount = delivered.get(key) ?? 0;
      points.push({
        label:
          rangeDays <= 7
            ? WEEKDAY_LABELS[d.getDay()]
            : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        orders: Math.max(0, (placed.get(key) ?? 0) - deliveredCount),
        delivered: deliveredCount,
      });
    }
    return points;
  }, [rangeOrders, from, rangeDays]);

  // The selected window against the one immediately before it — the KPI tiles' delta badges.
  const trendDelta = useMemo(() => {
    // The window of equal length ending the day before `from`.
    const previousTo = addDaysIso(from, -1);
    const previousFrom = addDaysIso(from, -rangeDays);

    const inWindow = (start: string, end: string) =>
      (orders ?? []).filter(
        (o) => o.createdAt.slice(0, 10) >= start && o.createdAt.slice(0, 10) <= end,
      );

    const current = rangeOrders;
    const previous = inWindow(previousFrom, previousTo);
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
  }, [orders, rangeOrders, from, rangeDays]);

  const shipmentStatusSlices: ShipmentStatusSlice[] = useMemo(() => {
    let delivered = 0;
    let inTransit = 0;
    let exception = 0;
    let pending = 0;
    for (const o of rangeOrders) {
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
  }, [rangeOrders]);

  const recentOrders = useMemo(
    () => [...rangeOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [rangeOrders],
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome back, {user ? displayName(user.email) : "there"}.
          </h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening today.</p>
        </div>

        {/* Native <input type="date"> rather than a picker component: it is already localised,
            keyboard-accessible and touch-friendly on every target browser, and the app has no
            other date-range control to stay consistent with. */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              min={from}
              max={todayIso()}
              onChange={(e) => e.target.value && setTo(e.target.value)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex rounded-lg border border-border p-0.5">
            {RANGE_PRESETS.map((preset) => {
              const presetFrom = addDaysIso(todayIso(), -(preset.days - 1));
              const isActive = from === presetFrom && to === todayIso();
              return (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => {
                    setFrom(presetFrom);
                    setTo(todayIso());
                  }}
                  aria-pressed={isActive}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Total Orders"
          value={rangeOrders.length}
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
            <CardHeader>
              <div>
                <CardTitle>Orders Overview</CardTitle>
                <p className="text-2xl font-semibold text-foreground">
                  {ordersTrend.reduce((sum, p) => sum + Number(p.orders) + Number(p.delivered), 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Orders placed, {formatIsoLong(from)} – {formatIsoLong(to)}
                </p>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id} href={`/admin/orders/${order.id}`}>
                        <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                        <TableCell>{customerNameById.get(order.customerId) ?? "—"}</TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell>{new Date(order.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>
                          {order.paidAmount !== null ? `₹${Math.round(order.paidAmount).toLocaleString("en-IN")}` : "—"}
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
        </div>
      </div>
    </div>
  );
}
