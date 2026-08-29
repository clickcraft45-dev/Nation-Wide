import Link from "next/link";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

export function KpiCard({
  title,
  value,
  icon: Icon,
  href,
  isLoading,
  hint,
  deltaPercent,
  deltaLabel,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  href: string;
  isLoading?: boolean;
  hint?: string;
  /** Change against the previous period of the same length. Omit when there's nothing to compare. */
  deltaPercent?: number | null;
  deltaLabel?: string;
}) {
  const hasDelta = typeof deltaPercent === "number" && Number.isFinite(deltaPercent);
  const isUp = hasDelta && deltaPercent >= 0;
  return (
    <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="glass-interactive glass-sheen h-full">
        <CardContent className="flex items-start justify-between pt-5">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-foreground">{value}</p>
            )}
            {hasDelta && !isLoading && (
              <span
                className={cn(
                  "glass-pill inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  // Direction is spelled by the arrow and the sign, not by colour alone — up is
                  // not automatically "good" here (rising exceptions or pending payments aren't).
                  "border-[color:var(--glass-edge)] bg-white/60 text-muted-foreground",
                )}
              >
                {isUp ? (
                  <TrendingUp className="h-3 w-3" aria-hidden />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden />
                )}
                {isUp ? "+" : ""}
                {deltaPercent.toFixed(1)}%
                {deltaLabel ? <span className="sr-only"> {deltaLabel}</span> : null}
              </span>
            )}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="glass-rim flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-primary">
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
