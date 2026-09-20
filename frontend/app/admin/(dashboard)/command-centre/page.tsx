"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Building2,
  Crown,
  Globe2,
  Receipt,
  ShieldCheck,
  Truck,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { CommandCentreDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { TrendAreaChart } from "@/components/ui/trend-area-chart";
import { cn } from "@/lib/utils/cn";

const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

/** Status codes read as SHOUTING_SNAKE everywhere else; a dashboard should read as English. */
const humanise = (label: string) =>
  label.charAt(0) + label.slice(1).toLowerCase().replaceAll("_", " ");

// Ordered darkest-to-lightest so the biggest slice is also the heaviest on the page.
const CATEGORY_SHADES = [
  "bg-brand-red",
  "bg-brand-red/80",
  "bg-brand-red/65",
  "bg-brand-red/50",
  "bg-brand-red/40",
  "bg-brand-red/30",
  "bg-brand-red/20",
];

/**
 * The SUPER_ADMIN command centre: the whole company on one screen — money in against money out,
 * where the work is sitting, and who is doing it.
 *
 * Everything here is an aggregate computed by the server (see CommandCentreService). The page
 * fetches one endpoint and draws it; it never pulls tables down to count them in the browser.
 */
export default function CommandCentrePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<CommandCentreDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<CommandCentreDto>("/admin/command-centre")
      .then(setData)
      .catch((err) =>
        setError(
          errorMessage(err, "Couldn't load the command centre right now."),
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  // The server is the authority — it answers 404 to anyone but a SUPER_ADMIN. This is only so the
  // page says something useful rather than showing a bare error.
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <ErrorState message="The command centre is for super admins. Your dashboard is under Overview." />
    );
  }
  if (error || !data) {
    return <ErrorState message={error ?? "Nothing to show yet."} />;
  }

  const { money: m, people, work } = data;
  const profitable = m.profit >= 0;
  const biggestCategory = data.expensesByCategory[0];
  const categoryTotal = data.expensesByCategory.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-red-tint px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-red">
            <Crown className="h-3.5 w-3.5" aria-hidden />
            Super admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Command centre</h1>
          <p className="text-sm text-muted-foreground">
            The last six months of the whole company — money, work and people.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/expenses"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <Wallet className="h-4 w-4" aria-hidden /> Expenses
          </Link>
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Reports <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      {/* The headline: what came in, what went out, and what is left. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyTile
          label="Received"
          value={money(m.revenue)}
          caption={`${money(m.receivedToday)} today`}
          icon={Banknote}
          tone="good"
        />
        <MoneyTile
          label="Spent"
          value={money(m.expenses)}
          caption={`${money(m.spentToday)} today`}
          icon={Receipt}
          tone="warn"
        />
        <MoneyTile
          label={profitable ? "Profit" : "Loss"}
          value={money(Math.abs(m.profit))}
          caption={
            m.marginPercent === null
              ? "No revenue yet to take a margin of"
              : `${m.marginPercent}% margin`
          }
          icon={profitable ? TrendingUp : TrendingDown}
          tone={profitable ? "good" : "bad"}
        />
        <MoneyTile
          label="Awaiting payment"
          value={String(m.unpaidOrders)}
          caption={`${work.quotesAwaiting} quotes awaiting a price`}
          icon={Wallet}
          tone={m.unpaidOrders > 0 ? "warn" : "muted"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Money in and out</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendAreaChart
              data={data.months.map((row) => ({
                label: monthLabel(row.month),
                Received: row.revenue,
                Spent: row.expenses,
              }))}
              series={[
                { key: "Received", label: "Received" },
                { key: "Spent", label: "Spent" },
              ]}
              valueFormatter={money}
              caption="Money received against money spent, by month"
              height={280}
            />
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center sm:grid-cols-6">
              {data.months.map((row) => (
                <div key={row.month}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {monthLabel(row.month)}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      row.profit >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {row.profit >= 0 ? "+" : "−"}
                    {money(Math.abs(row.profit))}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.expensesByCategory.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No expenses recorded in this period.
              </p>
            )}
            {data.expensesByCategory.slice(0, 7).map((row, i) => {
              const share = categoryTotal > 0 ? (row.amount / categoryTotal) * 100 : 0;
              return (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-foreground">
                      {humanise(row.category)}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {money(row.amount)} · {Math.round(share)}%
                    </span>
                  </div>
                  {/* A bar, not a pie: twelve categories in a pie is a colour-matching puzzle. */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", CATEGORY_SHADES[i] ?? "bg-brand-red/20")}
                      style={{ width: `${Math.max(share, 1.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {biggestCategory && (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                Biggest outgoing: <strong className="text-foreground">{humanise(biggestCategory.category)}</strong>{" "}
                at {money(biggestCategory.amount)} over six months.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PeopleRow
              icon={Users}
              label="Customers"
              value={people.customers}
              caption={`${people.b2bCustomers} business accounts`}
              href="/admin/customers"
            />
            <PeopleRow
              icon={Truck}
              label="Pickup partners"
              value={people.partners}
              caption={`${people.activePartners} active`}
              href="/admin/pickup-partners"
            />
            <PeopleRow
              icon={ShieldCheck}
              label="Admins"
              value={people.admins + people.superAdmins}
              caption={`${people.superAdmins} super admin${people.superAdmins === 1 ? "" : "s"}${
                people.deactivatedAdmins > 0
                  ? ` · ${people.deactivatedAdmins} deactivated`
                  : ""
              }`}
              href="/admin/users"
            />
            <PeopleRow
              icon={Building2}
              label="B2B portals"
              value={people.b2bCustomers}
              caption="Businesses booking their own shipments"
              href="/admin/customers"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Work in flight</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusBars title="Pickups" rows={work.pickupsByStatus} />
            <StatusBars title="Orders" rows={work.ordersByStatus} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Busiest partners</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.partnerLeaderboard.length === 0 && (
                <p className="text-sm text-muted-foreground">No completed pickups yet.</p>
              )}
              {data.partnerLeaderboard.map((partner, i) => (
                <div key={partner.partnerId} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      i === 0
                        ? "bg-brand-red text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {partner.name}
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {partner.completed} pickups
                    <span className="block tabular-nums text-foreground">
                      {money(partner.collected)}
                    </span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-brand-red" aria-hidden />
                Top destinations
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {data.topDestinations.length === 0 && (
                <p className="text-sm text-muted-foreground">No quotes in this period.</p>
              )}
              {data.topDestinations.map((row) => (
                <span
                  key={row.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-foreground"
                >
                  {row.label}
                  <span className="rounded-full bg-muted px-1.5 font-semibold tabular-nums">
                    {row.count}
                  </span>
                </span>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MoneyTile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Banknote;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const tones = {
    good: "bg-success-bg text-success",
    warn: "bg-warning-bg text-warning",
    bad: "bg-danger-bg text-danger",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", tones[tone])}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

function PeopleRow({
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
      className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-red-tint text-brand-red">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{caption}</span>
      </span>
      <span className="shrink-0 text-lg font-semibold tabular-nums text-foreground">{value}</span>
    </Link>
  );
}

function StatusBars({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      {rows
        .slice()
        .sort((a, b) => b.count - a.count)
        .map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 truncate text-muted-foreground">
              {humanise(row.label)}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-brand-red/70"
                style={{ width: `${total > 0 ? Math.max((row.count / total) * 100, 2) : 0}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-foreground">
              {row.count}
            </span>
          </div>
        ))}
    </div>
  );
}
