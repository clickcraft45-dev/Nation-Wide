"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { cn } from "@/lib/utils/cn";

// Geographic bounds of /assets/images/world-map-dotted.svg, whose viewBox is 0 0 265 100.
// dotted-map derives these from the landmass extents rather than the full -180..180/-90..90
// globe, so they are NOT the textbook numbers. scripts/generate-dotted-map.mjs asserts they
// still hold every time the asset is regenerated — change them in both places or not at all.
const VIEW_WIDTH = 265;
const VIEW_HEIGHT = 100;
const LNG_MIN = -168;
const LNG_SPAN = 336;
const LAT_MAX = 71;
const LAT_SPAN = 127;

export interface MapRoute {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
}

interface WorldMapProps {
  routes?: MapRoute[];
  /** Defaults to the light accent used on the brand's near-black panels. */
  lineColor?: string;
  className?: string;
}

const projectPoint = (lat: number, lng: number) => ({
  x: ((lng - LNG_MIN) / LNG_SPAN) * VIEW_WIDTH,
  y: ((LAT_MAX - lat) / LAT_SPAN) * VIEW_HEIGHT,
});

// Lift the control point by a fraction of the horizontal span so short hops stay shallow and
// long-haul lanes bow properly, instead of every arc getting the same fixed arch.
const curvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
  const lift = Math.abs(end.x - start.x) * 0.22 + 3;
  return `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${Math.min(start.y, end.y) - lift} ${end.x} ${end.y}`;
};

/**
 * Dotted world map with animated great-circle-ish route arcs. Decorative only — it carries no
 * information the surrounding copy doesn't, so it renders aria-hidden with an empty alt.
 *
 * The dots are a pre-rendered SVG (see scripts/generate-dotted-map.mjs); only the arcs are drawn
 * at runtime. Both layers are cover-cropped from the same 265x100 box — `slice` is the SVG
 * spelling of `object-cover` — so the arc endpoints stay glued to their coastlines at any
 * container shape. Size it by overriding the aspect ratio or giving the parent a height.
 */
export function WorldMap({ routes = [], lineColor = "#d4d4d8", className }: WorldMapProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none relative aspect-[265/100] w-full select-none",
        className,
      )}
    >
      <Image
        src="/assets/images/world-map-dotted.svg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-25"
      />
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="world-map-arc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
            <stop offset="12%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="88%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {routes.map((route, i) => {
          const start = projectPoint(route.start.lat, route.start.lng);
          const end = projectPoint(route.end.lat, route.end.lng);
          return (
            <g key={i}>
              <motion.path
                d={curvedPath(start, end)}
                fill="none"
                stroke="url(#world-map-arc)"
                strokeWidth="0.4"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.4 * i, ease: "easeOut" }}
              />
              {[start, end].map((point, j) => (
                <g key={j}>
                  <circle cx={point.x} cy={point.y} r="0.7" fill={lineColor} />
                  <circle cx={point.x} cy={point.y} r="0.7" fill={lineColor} opacity="0.5">
                    <animate
                      attributeName="r"
                      from="0.7"
                      to="2.8"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.5"
                      to="0"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
