"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Download, IndianRupee, Package, Percent, ReceiptIndianRupee, Users } from "lucide-react";
import type { AnalyticsDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { addDaysIso, formatIsoLong, todayIso } from "@/components/ui/calendar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrendAreaChart } from "@/components/ui/trend-area-chart";
import { PeriodBarChart } from "@/components/analytics/period-bar-chart";
import { RankedBars } from "@/components/analytics/ranked-bars";
import {
  DateRangeControl,
  inr,
  lastDays,
  percentChange,
  periodLabel,
  thisFinancialYear,
} from "@/components/analytics/date-range-control";

const PRESETS = [lastDays(7), lastDays(30), lastDays(90), { ...lastDays(365), label: "12 months" }, thisFinancialYear];

const PAYMENT_METHOD: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  RAZORPAY: "Razorpay",
  NOT_RECORDED: "Not recorded",
};

const BUCKET_WORD = { day: "day", week: "week", month: "month" } as const;

/** One decimal when it matters, none when it doesn't: 42%, 7.5%. */
const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "No data";

export default function AdminReportsPage() {
  const [from, setFrom] = useState(() => addDaysIso(todayIso(), -29));
  const [to, setTo] = useState(todayIso);
  const [data, setData] = useState<AnalyticsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // A fetch keyed on the range, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    apiClient
      .get<AnalyticsDto>(`/admin/analytics?from=${from}&to=${to}`)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(errorMessage(err, "Failed to load report data.")))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to, attempt]);

  const rows = useMemo(
    () => (data?.series ?? []).map((p) => ({ ...p, label: periodLabel(p.start, data!.bucket) })),
    [data],
  );

  const cur = data?.current;
  const prev = data?.previous;
  const word = BUCKET_WORD[data?.bucket ?? "day"];
  const aov = (t?: AnalyticsDto["current"]) => (t && t.paidOrders > 0 ? t.revenue / t.paidOrders : 0);
  const conv = (t?: AnalyticsDto["current"]) => (t && t.quotes > 0 ? t.convertedQuotes / t.quotes : 0);
  const delta = (now: number, before: number) => (cur && prev ? percentChange(now, before) : null);

  function downloadCsv() {
    if (!data) return;
    const lines = [
      ["Period starting", "Orders", "Delivered", "Revenue (INR)", "New customers"],
      ...data.series.map((p) => [p.start, p.orders, p.delivered, p.revenue.toFixed(2), p.newCustomers]),
      ["Total", data.current.orders, data.current.delivered, data.current.revenue.toFixed(2), data.current.newCustomers],
    ];
    const blob = new Blob([lines.map((l) => l.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nationwide-report-${data.from}-to-${data.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {formatIsoLong(from)} to {formatIsoLong(to)}, by {word}. Changes compare with the period
            just before, of the same length.
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <DateRangeControl
            from={from}
            to={to}
            presets={PRESETS}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
          <Button variant="secondary" size="sm" onClick={downloadCsv} disabled={!data || isLoading} className="min-h-9">
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          title="Revenue collected"
          value={inr(cur?.revenue ?? 0)}
          icon={IndianRupee}
          isLoading={isLoading}
          deltaPercent={delta(cur?.revenue ?? 0, prev?.revenue ?? 0)}
          deltaLabel="versus the previous period"
        />
        <KpiCard
          title="Orders placed"
          value={cur?.orders ?? 0}
          icon={Package}
          isLoading={isLoading}
          deltaPercent={delta(cur?.orders ?? 0, prev?.orders ?? 0)}
          deltaLabel="versus the previous period"
          hint={cur?.cancelled ? `${cur.cancelled} cancelled` : undefined}
        />
        <KpiCard
          title="Average order value"
          value={cur && cur.paidOrders > 0 ? inr(aov(cur)) : "No payments"}
          icon={ReceiptIndianRupee}
          isLoading={isLoading}
          deltaPercent={delta(aov(cur), aov(prev))}
          deltaLabel="versus the previous period"
        />
        <KpiCard
          title="Delivered so far"
          value={pct(cur?.delivered ?? 0, (cur?.orders ?? 0) - (cur?.cancelled ?? 0))}
          icon={CheckCircle2}
          isLoading={isLoading}
          hint={cur ? `${cur.delivered} of ${cur.orders - cur.cancelled} live orders` : undefined}
        />
        <KpiCard
          title="New customers"
          value={cur?.newCustomers ?? 0}
          icon={Users}
          isLoading={isLoading}
          deltaPercent={delta(cur?.newCustomers ?? 0, prev?.newCustomers ?? 0)}
          deltaLabel="versus the previous period"
        />
        <KpiCard
          title="Quote conversion"
          value={pct(cur?.convertedQuotes ?? 0, cur?.quotes ?? 0)}
          icon={Percent}
          isLoading={isLoading}
          deltaPercent={conv(prev) > 0 ? delta(conv(cur), conv(prev)) : null}
          deltaLabel="versus the previous period"
          hint={cur && cur.quotes > 0 ? `${cur.convertedQuotes} of ${cur.quotes} quotes booked` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="Revenue collected"
          subtitle={`Per ${word}, by the day payment was received`}
          wide
          isLoading={isLoading}
          empty={rows.every((r) => r.revenue === 0) ? "No payments collected in this range." : undefined}
        >
          <PeriodBarChart
            data={rows}
            series={[{ key: "revenue", label: "Revenue" }]}
            valueFormatter={inr}
            caption={`Revenue collected per ${word}`}
          />
        </ChartCard>
        <ChartCard title="Payment methods" subtitle="Share of revenue collected" isLoading={isLoading}>
          <RankedBars
            rows={(data?.paymentMethods ?? []).map((r) => ({ label: PAYMENT_METHOD[r.label] ?? r.label, value: r.amount }))}
            format={inr}
            empty="No payments collected in this range."
          />
        </ChartCard>

        <ChartCard
          title="Orders"
          subtitle={`Placed per ${word}, split by whether they have been delivered`}
          wide
          isLoading={isLoading}
          empty={rows.every((r) => r.orders === 0) ? "No orders placed in this range." : undefined}
        >
          <TrendAreaChart
            data={rows.map((r) => ({ label: r.label, orders: r.orders - r.delivered, delivered: r.delivered }))}
            series={[
              { key: "orders", label: "In progress" },
              { key: "delivered", label: "Delivered" },
            ]}
            caption={`Orders in progress and delivered, per ${word}`}
          />
        </ChartCard>
        <ChartCard title="Carriers" subtitle="Shipments booked with each" isLoading={isLoading}>
          <RankedBars
            rows={(data?.carriers ?? []).map((r) => ({ label: r.label, value: r.count }))}
            empty="No shipments booked in this range."
          />
        </ChartCard>

        <ChartCard
          title="New customers"
          subtitle={`Accounts created per ${word}`}
          wide
          isLoading={isLoading}
          empty={rows.every((r) => r.newCustomers === 0) ? "No new customers in this range." : undefined}
        >
          <PeriodBarChart
            data={rows}
            series={[{ key: "newCustomers", label: "New customers" }]}
            caption={`New customers per ${word}`}
            height={200}
          />
        </ChartCard>
        <ChartCard title="Top destinations" subtitle="Orders by destination country" isLoading={isLoading}>
          <RankedBars
            rows={(data?.destinations ?? []).map((r) => ({ label: r.label, value: r.count }))}
            empty="No orders with a destination in this range."
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By {word}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-112 overflow-auto">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">New customers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map((r) => (
                  <TableRow key={r.start}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.delivered}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.newCustomers}</TableCell>
                  </TableRow>
                ))}
                {cur && (
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{cur.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{cur.delivered}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(cur.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cur.newCustomers}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  wide,
  isLoading,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  wide?: boolean;
  isLoading: boolean;
  /** Shown instead of the chart when the range has nothing to plot: a flat line at zero says less. */
  empty?: string;
  children: ReactNode;
}) {
  return (
    <Card className={wide ? "lg:col-span-2" : undefined}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : empty ? (
          <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
