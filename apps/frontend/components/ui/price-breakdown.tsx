import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface PriceBreakdownLine {
  label: ReactNode;
  value: ReactNode;
  /** Muted styling for informational sub-lines (e.g. "₹100/kg × 5kg"). */
  muted?: boolean;
}

/**
 * Line-item price panel: Base Rate → PSS → Fuel Charge → GST → NationWide Cut → Final Price.
 * Shared by the customer quote comparison, the admin rate editor's live preview, and the
 * pickup-partner reprice screen. Presentational only — the caller computes every number; this
 * component must never re-derive or duplicate the pricing formula.
 */
export function PriceBreakdown({
  lines,
  total,
  totalLabel = "Final Price",
  className,
}: {
  lines: PriceBreakdownLine[];
  total: ReactNode;
  totalLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="divide-y divide-border px-4">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className={line.muted ? "text-muted-foreground" : "text-foreground"}>
              {line.label}
            </span>
            <span
              className={cn(
                "font-medium tabular-nums",
                line.muted ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {line.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 rounded-b-lg bg-info-bg px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{totalLabel}</span>
        <span className="text-xl font-bold tabular-nums text-primary">{total}</span>
      </div>
    </div>
  );
}
