"use client";

import type { AnalyticsBucket } from "@nationwide/shared-types";
import { DateField } from "@/components/ui/date-field";
import { addDaysIso, fromIso, todayIso } from "@/components/ui/calendar";
import { cn } from "@/lib/utils/cn";

interface RangePreset {
  label: string;
  /** The `from` this preset sets; `to` is always today. */
  from: () => string;
}

export const lastDays = (days: number): RangePreset => ({
  label: days % 30 === 0 && days >= 90 ? `${days / 30} months` : `${days} days`,
  from: () => addDaysIso(todayIso(), -(days - 1)),
});

/** The Indian financial year, April to March, that today falls in. */
export const thisFinancialYear: RangePreset = {
  label: "This FY",
  from: () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
  },
};

/**
 * From/To plus preset shortcuts. The two dates are the single source of truth; a preset only
 * writes into them, and shows as pressed while they still match it.
 */
export function DateRangeControl({
  from,
  to,
  onChange,
  presets,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  presets: RangePreset[];
}) {
  const today = todayIso();
  return (
    <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
      <div className="flex w-[calc(50%-0.375rem)] flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-48">
        From
        <DateField title="Report from" value={from} max={to} onChange={(iso) => iso && onChange(iso, to)} />
      </div>
      <div className="flex w-[calc(50%-0.375rem)] flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-48">
        To
        <DateField
          title="Report to"
          value={to}
          min={from}
          max={today}
          align="end"
          onChange={(iso) => iso && onChange(from, iso)}
        />
      </div>
      <div role="group" aria-label="Quick ranges" className="flex max-w-full overflow-x-auto rounded-lg border border-border p-0.5">
        {presets.map((preset) => {
          const presetFrom = preset.from();
          const active = from === presetFrom && to === today;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(presetFrom, today)}
              aria-pressed={active}
              className={cn(
                "min-h-9 shrink-0 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A bucket's axis label: "5 Nov" for a day, "w/c 3 Nov" for a week, "Nov 26" for a month. */
export function periodLabel(start: string, bucket: AnalyticsBucket): string {
  const d = fromIso(start);
  if (bucket === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return bucket === "week" ? `w/c ${day}` : day;
}

/** Change against the previous window, one decimal. Null when there was nothing before. */
export function percentChange(now: number, before: number): number | null {
  return before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10;
}

export const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

