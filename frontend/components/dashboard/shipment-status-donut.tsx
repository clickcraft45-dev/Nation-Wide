"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ShipmentStatusSlice {
  key: string;
  label: string;
  value: number;
  /** One of the fixed semantic status tokens — never a generic categorical hue. */
  colorVar: "--color-success" | "--color-warning" | "--color-info" | "--color-danger";
  icon: LucideIcon;
}

const SIZE = 140;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP_PX = 3; // surface-color gap between segments, per the dataviz mark spec

// Status is a fixed, reserved color scale (never the categorical theme) and always ships with an
// icon + label — two of these four brand tokens (#B45309/#B91C1C) sit too close for full CVD
// separation, so this component never lets Warning and Danger touch: they're ordered opposite
// each other around the ring, and every legend row carries both an icon and a color swatch so
// identity never rides on color alone.
export function ShipmentStatusDonut({ slices }: { slices: ShipmentStatusSlice[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const fractions = slices.map((slice) => (total > 0 ? slice.value / total : 0));
  // Cumulative start offset per slice, built without mutating a captured variable inside .map.
  const cumulativeOffsets = fractions.reduce<number[]>((acc, _fraction, i) => {
    const previous = i === 0 ? 0 : acc[i - 1] + fractions[i - 1] * CIRCUMFERENCE;
    acc.push(previous);
    return acc;
  }, []);
  const arcs = slices.map((slice, i) => {
    const fraction = fractions[i];
    const rawLength = fraction * CIRCUMFERENCE;
    const length = Math.max(0, rawLength - GAP_PX);
    return {
      ...slice,
      fraction,
      dasharray: `${length} ${CIRCUMFERENCE - length}`,
      dashoffset: -cumulativeOffsets[i],
    };
  });

  const active = arcs.find((a) => a.key === activeKey) ?? null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={STROKE}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={`var(${arc.colorVar})`}
              strokeWidth={activeKey === arc.key ? STROKE + 3 : STROKE}
              strokeDasharray={arc.dasharray}
              strokeDashoffset={arc.dashoffset}
              tabIndex={0}
              role="img"
              aria-label={`${arc.label}: ${arc.value} shipments, ${Math.round(arc.fraction * 100)}%`}
              className="cursor-pointer outline-none transition-[stroke-width]"
              onMouseEnter={() => setActiveKey(arc.key)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(arc.key)}
              onBlur={() => setActiveKey(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {active ? (
            <>
              <p className="text-2xl font-bold text-foreground">{active.value}</p>
              <p className="text-xs text-muted-foreground">{active.label}</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </>
          )}
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {arcs.map((arc) => {
          const Icon = arc.icon;
          return (
            <li
              key={arc.key}
              onMouseEnter={() => setActiveKey(arc.key)}
              onMouseLeave={() => setActiveKey(null)}
              className={cn(
                "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors",
                activeKey === arc.key && "bg-muted",
              )}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `var(${arc.colorVar})` }}
              >
                <Icon className="h-3.5 w-3.5 text-white" aria-hidden />
              </span>
              <span className="flex-1 text-foreground">{arc.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {arc.value} ({total > 0 ? Math.round((arc.value / total) * 100) : 0}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
