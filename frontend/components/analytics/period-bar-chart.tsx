"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint, TrendSeries } from "@/components/ui/trend-area-chart";

// The same two neutral steps as TrendAreaChart (validated there), so a series reads the same
// colour on every chart in the console.
const SERIES_COLORS = ["#27272a", "#71717a"] as const;

/**
 * Amounts per period as bars: one series, or two side by side (money in against money out).
 * Side by side, never stacked: received and spent do not add up to anything.
 */
export function PeriodBarChart({
  data,
  series,
  valueFormatter = (value: number) => value.toLocaleString("en-IN"),
  height = 260,
  caption,
}: {
  data: TrendPoint[];
  series: TrendSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
  caption: string;
}) {
  // Every tick in the same unit: "8.5k, 17k, 25.5k", never "75,000" under "100k".
  const compact = (value: number) =>
    value >= 1000 ? `${Number((value / 1000).toFixed(1)).toLocaleString("en-IN")}k` : value.toLocaleString("en-IN");

  return (
    <div className="w-full">
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-4">
          {series.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: SERIES_COLORS[i] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={16}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={compact}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload && payload.length > 0 ? (
                  <div className="glass-raised rounded-xl px-3 py-2">
                    <p className="text-xs font-medium text-foreground">{String(label)}</p>
                    {payload.map((entry) => (
                      <p key={String(entry.dataKey)} className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span aria-hidden className="h-2 w-2 rounded-xs" style={{ backgroundColor: entry.color }} />
                        {series.find((s) => s.key === entry.dataKey)?.label}:{" "}
                        <span className="font-medium tabular-nums text-foreground">
                          {valueFormatter(Number(entry.value ?? 0))}
                        </span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} fill={SERIES_COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Period</th>
              {series.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.label}>
                <td>{point.label}</td>
                {series.map((s) => (
                  <td key={s.key}>{valueFormatter(Number(point[s.key] ?? 0))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
