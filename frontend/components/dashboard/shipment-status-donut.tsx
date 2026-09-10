"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Label, LabelList, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/pie-chart";

export interface ShipmentStatusSlice {
  key: string;
  label: string;
  value: number;
  /** One of the fixed semantic status tokens — never a generic categorical hue. */
  colorVar: "--color-success" | "--color-warning" | "--color-info" | "--color-danger";
  icon: LucideIcon;
}

/**
 * Shipment status mix, as a donut.
 *
 * Drawn with recharts through the shared chart primitives rather than the hand-rolled
 * stroke-dasharray arcs this used to be: the rounded, padded segments and the hover tooltip come
 * with the library, and the arithmetic that placed each arc (cumulative offsets, gap subtraction)
 * is gone.
 *
 * Status is a fixed, reserved colour scale (never the categorical theme) and always ships with an
 * icon + label — two of these four brand tokens (#B45309/#B91C1C) sit too close for full CVD
 * separation, so identity never rides on colour alone: every legend row carries an icon and a
 * swatch, and each segment is labelled with its own count.
 *
 * The colours are the semantic tokens themselves rather than hexes, so retoning a status in
 * globals.css retones the chart with everything else that shows it.
 */
export function ShipmentStatusDonut({ slices }: { slices: ShipmentStatusSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  // recharts wants the fill on the datum; the config supplies the tooltip labels and, via
  // ChartStyle, the per-chart `--color-<key>` variables those fills point at.
  const chartData = useMemo(
    () => slices.map((slice) => ({ ...slice, fill: `var(--color-${slice.key})` })),
    [slices],
  );

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      value: { label: "Shipments" },
      ...Object.fromEntries(
        slices.map((slice) => [slice.key, { label: slice.label, color: `var(${slice.colorVar})` }]),
      ),
    }),
    [slices],
  );

  return (
    <div className="flex flex-col items-center gap-4">
      {total === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">No shipments yet.</p>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[190px] w-full [&_.recharts-text]:fill-white"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="key"
              innerRadius={45}
              radius={10}
              cornerRadius={8}
              paddingAngle={4}
            >
              {/* The count sits on its own segment, so a reader never has to match a colour to a
                  legend row to know how big a slice is. */}
              <LabelList
                dataKey="value"
                stroke="none"
                fontSize={12}
                fontWeight={500}
                fill="currentColor"
                formatter={(value) => (Number(value) > 0 ? String(value) : "")}
              />
              <Label
                position="center"
                content={({ viewBox }) =>
                  viewBox && "cx" in viewBox && "cy" in viewBox ? (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-2xl font-bold"
                      >
                        {total}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 20}
                        className="fill-muted-foreground text-xs"
                      >
                        Total
                      </tspan>
                    </text>
                  ) : null
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      )}

      <ul className="w-full space-y-1.5">
        {slices.map((slice) => {
          const Icon = slice.icon;
          return (
            <li
              key={slice.key}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `var(${slice.colorVar})` }}
              >
                <Icon className="h-3.5 w-3.5 text-white" aria-hidden />
              </span>
              <span className="flex-1 text-foreground">{slice.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {slice.value} ({total > 0 ? Math.round((slice.value / total) * 100) : 0}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
