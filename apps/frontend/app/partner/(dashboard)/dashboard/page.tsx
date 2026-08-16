"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Wallet } from "lucide-react";
import type { PickupPartnerDashboardSummaryDto, PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuth } from "@/state/auth-context";
import { ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PickupCard } from "@/components/partner/pickup-card";

const NON_TERMINAL = new Set([
  "PENDING_ASSIGNMENT",
  "ASSIGNED",
  "SCHEDULED",
  "OUT_FOR_PICKUP",
  "VERIFICATION_PENDING",
]);

function displayName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  const firstSegment = localPart.split(/[._-]/)[0] ?? localPart;
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function PartnerDashboardHomePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<PickupPartnerDashboardSummaryDto | null>(null);
  const [pickups, setPickups] = useState<PickupRequestDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<PickupPartnerDashboardSummaryDto>("/partner/pickup-requests/dashboard-summary"),
      apiClient.get<PickupRequestDto[]>("/partner/pickup-requests"),
    ])
      .then(([summaryRes, pickupsRes]) => {
        if (cancelled) return;
        setSummary(summaryRes);
        setPickups(pickupsRes);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? "Failed to load your dashboard." : "Something went wrong.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { todayPickups, tomorrowPickups, upcomingDates } = useMemo(() => {
    const now = new Date();
    const today = isoDate(now);
    const tomorrowD = new Date(now);
    tomorrowD.setDate(tomorrowD.getDate() + 1);
    const tomorrow = isoDate(tomorrowD);

    const active = pickups.filter((p) => NON_TERMINAL.has(p.status));
    const todayPickups = active.filter((p) => p.pickupDate === today);
    const tomorrowPickups = active.filter((p) => p.pickupDate === tomorrow);

    const upcomingCounts = new Map<string, number>();
    for (const p of active) {
      if (!p.pickupDate || p.pickupDate === today || p.pickupDate === tomorrow) continue;
      upcomingCounts.set(p.pickupDate, (upcomingCounts.get(p.pickupDate) ?? 0) + 1);
    }
    const upcomingDates = [...upcomingCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 5);

    return { todayPickups, tomorrowPickups, upcomingDates };
  }, [pickups]);

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {greeting()}, {user ? displayName(user.email) : "there"}
        </h1>
        <p className="text-sm text-muted-foreground">Here&apos;s your route for today.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatChip label="Today" value={isLoading ? undefined : summary?.todayPickups} />
        <StatChip label="Pending" value={isLoading ? undefined : summary?.pendingPickups} />
        <StatChip
          label="Collected Today"
          value={
            isLoading
              ? undefined
              : formatInr((summary?.cashCollectedToday ?? 0) + (summary?.upiCollectedToday ?? 0))
          }
        />
      </div>

      <Section title="Today's Pickups" count={todayPickups.length} isLoading={isLoading}>
        {todayPickups.map((p) => (
          <PickupCard key={p.id} pickup={p} />
        ))}
      </Section>

      <Section title="Tomorrow's Pickups" count={tomorrowPickups.length} isLoading={isLoading}>
        {tomorrowPickups.map((p) => (
          <PickupCard key={p.id} pickup={p} />
        ))}
      </Section>

      {!isLoading && upcomingDates.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Upcoming</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {upcomingDates.map(([date, count]) => (
              <Link
                key={date}
                href={`/partner/pickups?date=${date}`}
                className="flex items-center justify-between px-4 py-3 text-sm active:bg-muted/60"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-muted-foreground">{count} pickup{count === 1 ? "" : "s"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Link
        href="/partner/pickups"
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground active:bg-muted/60"
      >
        <Wallet className="h-4 w-4" aria-hidden />
        View all pickups
      </Link>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 text-center">
      {value === undefined ? (
        <Skeleton className="mx-auto h-6 w-10" />
      ) : (
        <p className="text-lg font-semibold text-foreground">{value}</p>
      )}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({
  title,
  count,
  isLoading,
  children,
}: {
  title: string;
  count: number;
  isLoading: boolean;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
