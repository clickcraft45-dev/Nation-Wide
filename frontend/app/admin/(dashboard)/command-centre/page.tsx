"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Receipt, ShieldCheck, Truck, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import type { CommandCentreDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { addDaysIso, formatIsoLong, todayIso } from "@/components/ui/calendar";
import { KpiCard } from "@/components/dashboard/kpi-card";
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
import { cn } from "@/lib/utils/cn";

const PRESETS = [
  { label: "3 months", from: () => addDaysIso(todayIso(), -89) },
  { label: "6 months", from: () => addDaysIso(todayIso(), -179) },
  { ...lastDays(365), label: "12 months" },
  thisFinancialYear,
];

/**
 * The SUPER_ADMIN command centre: the company's money over a chosen range (collected against
 * spent, and where it went), the people behind it, and the partners doing the work. Operations
 * live on the dashboard and order analysis in Reports, so neither is repeated here.
 *
 * Everything is a server aggregate (CommandCentreService); the page fetches one endpoint.
 */
export default function CommandCentrePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [from, setFrom] = useState(() => addDaysIso(todayIso(), -179));
  const [to, setTo] = useState(todayIso);
  const [data, setData] = useState<CommandCentreDto | null>(null);
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
      .get<CommandCentreDto>(`/admin/command-centre?from=${from}&to=${to}`)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(errorMessage(err, "Couldn't load the command centre right now.")))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to, attempt]);

  // The server is the authority: it answers 404 to anyone but a SUPER_ADMIN. This only makes the
  // page say something useful instead of a bare error.
  if (!authLoading && user && user.role !== "SUPER_ADMIN") {
    return <ErrorState message="The command centre is for super admins. Your dashboard is under Overview." />;
  }

  const m = data?.money;
  const profitable = (m?.profit ?? 0) >= 0;
  const previousProfit = m ? m.previousRevenue - m.previousExpenses : 0;
  const people = data?.people;
  const word = data?.bucket ?? "month";

  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Command centre</h1>
          <p className="text-sm text-muted-foreground">
            Money collected against money spent, {formatIsoLong(from)} to {formatIsoLong(to)}.
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

      {error && <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Collected"
          value={inr(m?.revenue ?? 0)}
          icon={Banknote}
          href="/admin/payments"
          isLoading={isLoading}
          deltaPercent={m ? percentChange(m.revenue, m.previousRevenue) : null}
          deltaLabel="versus the previous period"
          hint={m ? `${inr(m.receivedToday)} today` : undefined}
        />
        <KpiCard
          title="Spent"
          value={inr(m?.expenses ?? 0)}
          icon={Receipt}
          href="/admin/expenses"
          isLoading={isLoading}
          deltaPercent={m ? percentChange(m.expenses, m.previousExpenses) : null}
          deltaLabel="versus the previous period"
          hint={m ? `${inr(m.spentToday)} today` : undefined}
        />
        <KpiCard
          title={profitable ? "Profit" : "Loss"}
          value={inr(Math.abs(m?.profit ?? 0))}
          icon={profitable ? TrendingUp : TrendingDown}
          isLoading={isLoading}
          // Off a loss the percentage means nothing a reader can use, so there is none.
          deltaPercent={m && previousProfit > 0 ? percentChange(m.profit, previousProfit) : null}
          deltaLabel="versus the previous period"
          hint={m ? (m.marginPercent === null ? "Nothing collected to take a margin of" : `${m.marginPercent}% margin`) : undefined}
        />
        <KpiCard
          title="Orders awaiting payment"
          value={m?.unpaidOrders ?? 0}
          icon={Wallet}
          href="/admin/payments"
          isLoading={isLoading}
          hint="All time, not just this range"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Collected and spent</CardTitle>
            <p className="text-xs text-muted-foreground">Per {word}, with what was left after costs underneath</p>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-72 w-full" />
            ) : data.money.revenue === 0 && data.money.expenses === 0 ? (
              <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                No money collected or spent in this range.
              </p>
            ) : (
              <>
                <PeriodBarChart
                  data={data.series.map((row) => ({
                    label: periodLabel(row.start, data.bucket),
                    collected: row.revenue,
                    spent: row.expenses,
                  }))}
                  series={[
                    { key: "collected", label: "Collected" },
                    { key: "spent", label: "Spent" },
                  ]}
                  valueFormatter={inr}
                  caption={`Money collected against money spent, per ${word}`}
                  height={280}
                />
                {/* Net per period as text: a third bar would be read as a third flow of money. */}
                {data.series.length <= 12 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto border-t border-border pt-4">
                    {data.series.map((row) => (
                      <div key={row.start} className="min-w-20 flex-1 text-center">
                        <p className="text-[11px] text-muted-foreground">{periodLabel(row.start, data.bucket)}</p>
                        <p
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            row.profit >= 0 ? "text-success" : "text-danger",
                          )}
                        >
                          {row.profit >= 0 ? "+" : "−"}
                          {inr(Math.abs(row.profit))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
            <p className="text-xs text-muted-foreground">Expenses by category in this range</p>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <RankedBars
                rows={foldOther(data.expensesByCategory.map((r) => ({ label: r.category, value: r.amount })), 8)}
                format={inr}
                empty="No expenses recorded in this range."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
            <p className="text-xs text-muted-foreground">Accounts as of today</p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {isLoading || !people ? (
              <Skeleton className="h-24 w-full sm:col-span-3" />
            ) : (
              <>
                <PeopleTile
                  icon={Users}
                  label="Customers"
                  value={people.customers}
                  caption={`${people.b2bCustomers} business account${people.b2bCustomers === 1 ? "" : "s"}`}
                  href="/admin/customers"
                />
                <PeopleTile
                  icon={Truck}
                  label="Pickup partners"
                  value={people.partners}
                  caption={`${people.activePartners} active`}
                  href="/admin/pickup-partners"
                />
                <PeopleTile
                  icon={ShieldCheck}
                  label="Admins"
                  value={people.admins + people.superAdmins}
                  caption={`${people.superAdmins} super admin${people.superAdmins === 1 ? "" : "s"}${
                    people.deactivatedAdmins > 0 ? `, ${people.deactivatedAdmins} deactivated` : ""
                  }`}
                  href="/admin/people"
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Busiest partners</CardTitle>
            <p className="text-xs text-muted-foreground">Pickups completed in this range</p>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-24 w-full" />
            ) : data.partnerLeaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pickups completed in this range.</p>
            ) : (
              <ol className="divide-y divide-border">
                {data.partnerLeaderboard.map((partner, i) => (
                  <li key={partner.partnerId} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{partner.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {partner.completed} pickup{partner.completed === 1 ? "" : "s"}
                    </span>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums text-foreground">
                      {inr(partner.collected)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Past `limit` rows the tail folds into "Other", so the list never scrolls past what matters. */
function foldOther(rows: { label: string; value: number }[], limit: number) {
  if (rows.length <= limit) return rows;
  const other = rows.slice(limit - 1).reduce((sum, r) => sum + r.value, 0);
  return [...rows.slice(0, limit - 1), { label: "Other", value: other }];
}

function PeopleTile({
  icon: Icon,
  label,
  value,
  caption,
  href,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  caption: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </span>
      <span className="mt-1 block text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="block truncate text-xs text-muted-foreground">{caption}</span>
    </Link>
  );
}
