"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, CalendarDays, CheckCircle2, Users } from "lucide-react";
import type { OrderDto, CustomerDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Calendar, addDaysIso, fromIso, formatIsoLong, todayIso } from "@/components/ui/calendar";
import { BarChart } from "@/components/reports/bar-chart";
import { TrendAreaChart, type TrendPoint } from "@/components/ui/trend-area-chart";

/** Every ISO day from `from` to `to` inclusive, capped so one fat-fingered year can't render 365 points. */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 366; d = addDaysIso(d, 1)) days.push(d);
  return days;
}

function bucketLabel(iso: string, weekly: boolean): string {
  const d = fromIso(iso);
  const short = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return weekly ? `w/${short}` : short;
}

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function AdminReportsPage() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [providers, setProviders] = useState<ShippingProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [from, setFrom] = useState(() => addDaysIso(todayIso(), -6));
  const [to, setTo] = useState(todayIso);
  const [day, setDay] = useState(todayIso);

  useEffect(() => {
    Promise.all([
      apiClient.get<OrderDto[]>("/orders"),
      apiClient.get<CustomerDto[]>("/customers"),
      apiClient.get<ShippingProviderDto[]>("/shipping-providers"),
    ])
      .then(([o, c, p]) => {
        setOrders(o);
        setCustomers(c);
        setProviders(p);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const rangeOrders = useMemo(
    () => orders.filter((o) => o.createdAt.slice(0, 10) >= from && o.createdAt.slice(0, 10) <= to),
    [orders, from, to],
  );
  const rangeCustomers = useMemo(
    () => customers.filter((c) => c.createdAt.slice(0, 10) >= from && c.createdAt.slice(0, 10) <= to),
    [customers, from, to],
  );

  const delivered = rangeOrders.filter((o) => o.shipments[0]?.currentStatus === "DELIVERED").length;
  const revenue = rangeOrders
    .filter((o) => o.paymentStatus === "PAID")
    .reduce((sum, o) => sum + (o.paidAmount ?? 0), 0);

  // ponytail: daily points up to ~6 weeks, then weekly buckets — past that the x-axis runs out
  // of room for readable labels. Month buckets if anyone ever reports across a year.
  const weekly = days.length > 42;
  const seriesDays = weekly ? days.filter((_, i) => i % 7 === 0) : days;

  // One point per bucket, with delivered split out of the order count so the two areas stack to
  // the day's total rather than double-counting it.
  const ordersPerBucket: TrendPoint[] = seriesDays.map((start) => {
    const end = weekly ? addDaysIso(start, 6) : start;
    const inBucket = rangeOrders.filter(
      (o) => o.createdAt.slice(0, 10) >= start && o.createdAt.slice(0, 10) <= end,
    );
    const deliveredCount = inBucket.filter(
      (o) => o.shipments[0]?.currentStatus === "DELIVERED",
    ).length;
    return {
      label: bucketLabel(start, weekly),
      orders: inBucket.length - deliveredCount,
      delivered: deliveredCount,
    };
  });

  const customersPerBucket: TrendPoint[] = seriesDays.map((start) => {
    const end = weekly ? addDaysIso(start, 6) : start;
    return {
      label: bucketLabel(start, weekly),
      customers: rangeCustomers.filter(
        (c) => c.createdAt.slice(0, 10) >= start && c.createdAt.slice(0, 10) <= end,
      ).length,
    };
  });

  const providerCounts = providers.map((p) => ({
    label: p.name,
    value: rangeOrders.filter((o) => o.shipments[0]?.providerId === p.id).length,
  }));

  // Order volume for every day on the calendar, not just the report range — the dots are there
  // to show where the busy days sit so you know which range is worth pulling.
  const ordersByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const key = o.createdAt.slice(0, 10);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  const dayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === day);
  const dayRevenue = dayOrders
    .filter((o) => o.paymentStatus === "PAID")
    .reduce((sum, o) => sum + (o.paidAmount ?? 0), 0);
  const dayDelivered = dayOrders.filter((o) => o.shipments[0]?.currentStatus === "DELIVERED").length;

  const rangeLabel = `${formatIsoLong(from)} — ${formatIsoLong(to)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Orders, customer, and revenue metrics · {rangeLabel}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="w-44 space-y-1.5">
            <Label htmlFor="report-from">From</Label>
            <DateField
              id="report-from"
              title="From"
              subtitle="Start of the reporting period"
              max={to}
              markers={ordersByDay}
              markerLabel="orders"
              value={from}
              onChange={setFrom}
            />
          </div>
          <div className="w-44 space-y-1.5">
            <Label htmlFor="report-to">To</Label>
            <DateField
              id="report-to"
              title="To"
              subtitle="End of the reporting period"
              min={from}
              max={todayIso()}
              markers={ordersByDay}
              markerLabel="orders"
              value={to}
              onChange={setTo}
              align="end"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CalendarDays} label="Orders in Range" value={rangeOrders.length} isLoading={isLoading} />
        <StatCard icon={Package} label="Days Covered" value={days.length} isLoading={isLoading} />
        <StatCard icon={CheckCircle2} label="Delivered" value={delivered} isLoading={isLoading} />
        <StatCard icon={Users} label="New Customers" value={rangeCustomers.length} isLoading={isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue in range</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <>
                  <p className="text-2xl font-semibold text-foreground">{inr(revenue)}</p>
                  <p className="text-xs text-muted-foreground">
                    From orders marked paid between {rangeLabel}.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipment trends {weekly ? "(weekly)" : "(daily)"}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <TrendAreaChart
                  data={ordersPerBucket}
                  series={[
                    { key: "orders", label: "In progress" },
                    { key: "delivered", label: "Delivered" },
                  ]}
                  caption="Orders in progress and delivered per bucket"
                  height={220}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer growth {weekly ? "(weekly)" : "(daily)"}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <TrendAreaChart
                  data={customersPerBucket}
                  series={[{ key: "customers", label: "New customers" }]}
                  caption="New customers per bucket"
                  height={220}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Provider statistics</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : providerCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No providers configured.</p>
              ) : (
                <BarChart data={providerCounts} />
              )}
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <Skeleton className="h-104 w-full rounded-2xl" />
        ) : (
          <Calendar
            title="Order Volume"
            subtitle="Dots show orders placed that day"
            markers={ordersByDay}
            markerLabel="orders"
            selected={day}
            onSelect={setDay}
            className="max-w-none"
            footer={
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{formatIsoLong(day)}</p>
                {dayOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No orders placed on this day.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {dayOrders.length} order{dayOrders.length === 1 ? "" : "s"} · {dayDelivered}{" "}
                    delivered · {inr(dayRevenue)} collected
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFrom(day);
                    setTo(day > to ? day : to);
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Start the report range here
                </button>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between pt-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-10" />
          ) : (
            <p className="text-2xl font-semibold text-foreground">{value}</p>
          )}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
