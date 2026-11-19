"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileQuestion,
  IndianRupee,
  Package,
  Percent,
  RefreshCw,
  Truck,
  UserX,
} from "lucide-react";
import type {
  AnalyticsDto,
  DashboardSummaryDto,
  OrderDto,
  PickupRequestDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils/format-date-time";
import { useAuth } from "@/state/auth-context";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrendAreaChart } from "@/components/ui/trend-area-chart";
import { ShipmentStatusDonut, type ShipmentStatusSlice } from "@/components/dashboard/shipment-status-donut";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, addDaysIso, formatIsoLong, todayIso } from "@/components/ui/calendar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DateRangeControl,
  inr,
  lastDays,
  percentChange,
  periodLabel,
} from "@/components/analytics/date-range-control";
import { cn } from "@/lib/utils/cn";

function displayName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  const firstSegment = localPart.split(/[._-]/)[0] ?? localPart;
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

const IN_TRANSIT = new Set(["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"]);
// Pickups still on the board; cancelled, rejected and completed ones aren't workload any more.
const OPEN_PICKUP = new Set([
  "PENDING_ASSIGNMENT",
  "ASSIGNED",
  "SCHEDULED",
  "OUT_FOR_PICKUP",
  "VERIFICATION_PENDING",
]);
const PRESETS = [lastDays(7), lastDays(30), lastDays(90)];
// The board is watched, not just opened: it refreshes itself while the tab is in front.
const REFRESH_MS = 60_000;

interface Board {
  analytics: AnalyticsDto;
  summary: DashboardSummaryDto;
  pickups: PickupRequestDto[];
  recent: OrderDto[];
}

/**
 * The day-to-day operations board: what came in, what is moving, and what is waiting on someone.
 * Deeper analysis (carriers, destinations, payment mix, CSV) lives in Reports; money against
 * spend lives in the Command Centre.
 */
export default function AdminDashboardHomePage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(() => addDaysIso(todayIso(), -29));
  const [to, setTo] = useState(todayIso);
  const [scheduleDay, setScheduleDay] = useState(todayIso);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(
    async (quiet: boolean) => {
      if (!quiet) setIsLoading(true);
      try {
        const [analytics, summary, pickups, recent] = await Promise.all([
          apiClient.get<AnalyticsDto>(`/admin/analytics?from=${from}&to=${to}`),
          apiClient.get<DashboardSummaryDto>("/admin/dashboard-summary"),
          apiClient.get<PickupRequestDto[]>("/admin/pickup-requests"),
          apiClient.get<OrderDto[]>("/orders?page=1&pageSize=6"),
        ]);
        setBoard({ analytics, summary, pickups, recent });
        setError(null);
        setUpdatedAt(new Date());
      } catch (err) {
        // A failed background refresh keeps the last good board on screen rather than blanking it.
        if (!quiet) setError(errorMessage(err, "Failed to load dashboard data."));
      } finally {
        if (!quiet) setIsLoading(false);
      }
    },
    [from, to],
  );

  useEffect(() => {
    // A fetch keyed on the range, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const a = board?.analytics;
  const cur = a?.current;
  const prev = a?.previous;

  const trend = useMemo(
    () =>
      (a?.series ?? []).map((p) => ({
        label: periodLabel(p.start, a!.bucket),
        orders: p.orders - p.delivered,
        delivered: p.delivered,
      })),
    [a],
  );

  const slices: ShipmentStatusSlice[] = useMemo(() => {
    const sum = (match: (code: string) => boolean) =>
      (a?.shipmentStatus ?? []).filter((r) => match(r.label)).reduce((n, r) => n + r.count, 0);
    const delivered = sum((c) => c === "DELIVERED");
    const inTransit = sum((c) => IN_TRANSIT.has(c));
    const exception = sum((c) => c === "EXCEPTION");
    const pending = sum((c) => c !== "DELIVERED" && c !== "EXCEPTION" && !IN_TRANSIT.has(c));
    // Warning and danger sit opposite each other on the ring; see the donut's own note.
    return [
      { key: "delivered", label: "Delivered", value: delivered, colorVar: "--color-success", icon: CheckCircle2 },
      { key: "pending", label: "Pending", value: pending, colorVar: "--color-warning", icon: Clock },
      { key: "in-transit", label: "In transit", value: inTransit, colorVar: "--color-info", icon: Truck },
      { key: "exception", label: "Exception", value: exception, colorVar: "--color-danger", icon: AlertTriangle },
    ];
  }, [a]);
  const exceptions = slices.find((s) => s.key === "exception")?.value ?? 0;

  const pickups = useMemo(() => board?.pickups ?? [], [board]);
  const pickupsByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of pickups) {
      if (p.pickupDate && OPEN_PICKUP.has(p.status)) counts[p.pickupDate] = (counts[p.pickupDate] ?? 0) + 1;
    }
    return counts;
  }, [pickups]);
  const unassigned = pickups.filter((p) => p.status === "PENDING_ASSIGNMENT").length;
  const dayPickups = pickups.filter((p) => p.pickupDate === scheduleDay && OPEN_PICKUP.has(p.status));
  const dayUnassigned = dayPickups.filter((p) => p.status === "PENDING_ASSIGNMENT").length;

  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  const liveOrders = cur ? cur.orders - cur.cancelled : 0;
  const conversion = cur && cur.quotes > 0 ? Math.round((cur.convertedQuotes / cur.quotes) * 100) : null;
  const previousConversion = prev && prev.quotes > 0 ? (prev.convertedQuotes / prev.quotes) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome back, {user ? displayName(user.email) : "there"}.
          </h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {formatIsoLong(from)} to {formatIsoLong(to)}
            {updatedAt && (
              <button
                type="button"
                onClick={() => void load(true)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Refreshes every minute"
              >
                <RefreshCw className="h-3 w-3" aria-hidden />
                Updated {updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </button>
            )}
          </p>
        </div>
        <DateRangeControl
          from={from}
          to={to}
          presets={PRESETS}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Orders placed"
          value={cur?.orders ?? 0}
          icon={Package}
          href="/admin/orders"
          isLoading={isLoading}
          deltaPercent={cur && prev ? percentChange(cur.orders, prev.orders) : null}
          deltaLabel="versus the previous period"
          hint={cur?.cancelled ? `${cur.cancelled} cancelled` : undefined}
        />
        <KpiCard
          title="Revenue collected"
          value={inr(cur?.revenue ?? 0)}
          icon={IndianRupee}
          href="/admin/payments"
          isLoading={isLoading}
          deltaPercent={cur && prev ? percentChange(cur.revenue, prev.revenue) : null}
          deltaLabel="versus the previous period"
          hint={cur ? `${cur.paidOrders} paid order${cur.paidOrders === 1 ? "" : "s"}` : undefined}
        />
        <KpiCard
          title="Delivered"
          value={cur?.delivered ?? 0}
          icon={CheckCircle2}
          href="/admin/shipments"
          isLoading={isLoading}
          hint={liveOrders > 0 ? `${Math.round(((cur?.delivered ?? 0) / liveOrders) * 100)}% of live orders` : undefined}
        />
        <KpiCard
          title="Quote conversion"
          value={conversion === null ? "No quotes" : `${conversion}%`}
          icon={Percent}
          href="/admin/quotes"
          isLoading={isLoading}
          deltaPercent={
            conversion !== null && previousConversion ? percentChange(conversion, previousConversion) : null
          }
          deltaLabel="versus the previous period"
          hint={cur && cur.quotes > 0 ? `${cur.convertedQuotes} of ${cur.quotes} quotes booked` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle>Needs attention</CardTitle>
          <p className="text-xs text-muted-foreground">Live, whatever the date range</p>
        </CardHeader>
        <CardContent>
          {isLoading || !board ? (
            <Skeleton className="h-14 w-full" />
          ) : (
            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
                <AttentionRow
                  icon={FileQuestion}
                  label="Quotes awaiting a price"
                  count={board.summary.newQuotes}
                  hint={board.summary.needsManualReview ? `${board.summary.needsManualReview} need manual review` : undefined}
                  href="/admin/quotes"
                />
                <AttentionRow
                  icon={UserX}
                  label="Pickups without a partner"
                  count={unassigned}
                  href="/admin/pickup-requests"
                />
                <AttentionRow
                  icon={CreditCard}
                  label="Orders awaiting payment"
                  count={board.summary.pendingPayments}
                  href="/admin/payments"
                />
                <AttentionRow
                  icon={AlertTriangle}
                  label="Shipment exceptions"
                  count={exceptions}
                  hint="In this date range"
                  href="/admin/shipments"
                />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <p className="text-xs text-muted-foreground">Placed per {a?.bucket ?? "day"}, split by whether they have been delivered</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (cur?.orders ?? 0) === 0 ? (
              <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No orders placed in this range.
              </p>
            ) : (
              <TrendAreaChart
                data={trend}
                series={[
                  { key: "orders", label: "In progress" },
                  { key: "delivered", label: "Delivered" },
                ]}
                caption={`Orders in progress and delivered, per ${a?.bucket ?? "day"}`}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipment status</CardTitle>
            <p className="text-xs text-muted-foreground">Shipments on orders placed in this range</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-32 w-full" /> : <ShipmentStatusDonut slices={slices} />}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Latest orders</CardTitle>
            <Link
              href="/admin/orders"
              className="inline-flex min-h-9 items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              All orders <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading || !board ? (
              <Skeleton className="h-48 w-full" />
            ) : board.recent.length === 0 ? (
              <EmptyState icon={<Package className="h-8 w-8" aria-hidden />} title="No orders yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Placed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {board.recent.map((order) => (
                    <TableRow key={order.id} href={`/admin/orders/${order.id}`}>
                      <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                      <TableCell>{order.customerName ?? "Not recorded"}</TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.paidAmount !== null ? inr(order.paidAmount) : "Unpaid"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <Skeleton className="h-104 w-full rounded-2xl" />
        ) : (
          <Calendar
            title="Pickup schedule"
            subtitle="Dots show open pickups booked for that day"
            markers={pickupsByDay}
            markerLabel="pickups booked"
            selected={scheduleDay}
            onSelect={setScheduleDay}
            className="max-w-none"
            footer={
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{formatIsoLong(scheduleDay)}</p>
                {dayPickups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No open pickups booked for this day.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {dayPickups.length} pickup{dayPickups.length === 1 ? "" : "s"} · {dayUnassigned} without a partner ·{" "}
                      {inr(dayPickups.reduce((sum, p) => sum + p.estimatedPrice, 0))} booked value
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
      </div>
    </div>
  );
}

function AttentionRow({
  icon: Icon,
  label,
  count,
  hint,
  href,
}: {
  icon: typeof Package;
  label: string;
  count: number;
  hint?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className={cn("h-4 w-4 shrink-0", count > 0 ? "text-foreground" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-foreground">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          count > 0 ? "text-lg font-semibold text-foreground" : "text-xs text-muted-foreground",
        )}
      >
        {count > 0 ? count : "None"}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
