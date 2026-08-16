"use client";

import { useId, useMemo, useState } from "react";

export interface OrdersOverviewPoint {
  label: string;
  value: number;
}

const WIDTH = 560;
const HEIGHT = 200;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

// A single-series 7-day trend — sequential color job (one hue), per the dataviz method: trend
// over time defaults to a line/area in the brand's primary hue, never a rainbow. Ships its own
// hover crosshair (the reader aims at a date, not a 2px line) and an sr-only table so the same
// values are reachable without a pointer.
export function OrdersOverviewChart({ data }: { data: OrdersOverviewPoint[] }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, maxValue, plotWidth, plotHeight } = useMemo(() => {
    const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const maxValue = Math.max(1, ...data.map((d) => d.value));
    const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
    const points = data.map((d, i) => ({
      ...d,
      x: PAD_LEFT + step * i,
      y: PAD_TOP + plotHeight * (1 - d.value / maxValue),
    }));
    return { points, maxValue, plotWidth, plotHeight };
  }, [data]);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x},${PAD_TOP + plotHeight} L${points[0].x},${PAD_TOP + plotHeight} Z`
      : "";

  const gridLines = [0, 0.5, 1].map((t) => PAD_TOP + plotHeight * t);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Orders per day over the last ${data.length} days`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((y, i) => (
          <line
            key={i}
            x1={PAD_LEFT}
            y1={y}
            x2={WIDTH - PAD_RIGHT}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        ))}

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === i ? 5 : 4}
            fill="var(--color-primary)"
            stroke="var(--color-card)"
            strokeWidth={2}
          />
        ))}

        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {p.label}
          </text>
        ))}

        {hovered && (
          <line
            x1={hovered.x}
            y1={PAD_TOP}
            x2={hovered.x}
            y2={PAD_TOP + plotHeight}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        )}

        {/* Hover/focus target spans the whole plot — the crosshair snaps to the nearest day. */}
        <rect
          x={PAD_LEFT}
          y={0}
          width={plotWidth}
          height={HEIGHT}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: `${(hovered.y / HEIGHT) * 100}%`,
          }}
        >
          <p className="font-semibold text-foreground">{hovered.value} orders</p>
          <p className="text-muted-foreground">{hovered.label}</p>
        </div>
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        Peak day: {points.reduce((a, b) => (b.value > a.value ? b : a), points[0])?.label ?? "—"} ·
        Max {maxValue}
      </p>

      {/* Same data, reachable without hovering — keyboard/screen-reader parity. */}
      <table className="sr-only">
        <caption>Orders per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Orders</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
