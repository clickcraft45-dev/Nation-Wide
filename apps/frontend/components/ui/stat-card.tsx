import { type ReactNode } from "react";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * KPI card for dashboard summaries (admin "what needs my attention" grid, customer dashboard
 * quick stats, partner "today's pickups" stats). Presentational only — pass in already-summarized
 * numbers; never fetch or aggregate large datasets to feed this component.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  caption,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Positive = improvement (rendered success), negative = regression (rendered danger). */
  trend?: { value: string; direction: "up" | "down" };
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-info-bg text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {(trend || caption) && (
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                trend.direction === "up" ? "text-success" : "text-danger",
              )}
            >
              {trend.direction === "up" ? (
                <ArrowUp className="h-3 w-3" aria-hidden />
              ) : (
                <ArrowDown className="h-3 w-3" aria-hidden />
              )}
              {trend.value}
            </span>
          )}
          {caption && <span className="text-muted-foreground">{caption}</span>}
        </div>
      )}
    </div>
  );
}
