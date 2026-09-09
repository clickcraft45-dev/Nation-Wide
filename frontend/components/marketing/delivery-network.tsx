"use client";

import { useId } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import {
  FileText,
  CalendarClock,
  PackageCheck,
  Plane,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The delivery network as a hub-and-spoke diagram: NationWide at the centre, each stage of a
 * shipment orbiting it, with a pulse travelling each connector.
 *
 * Adapted from an "integrations" card pattern. Three deliberate departures from the source:
 *  - The peripheral nodes are the actual stages of a shipment, not vendor logos. A diagram of
 *    someone else's toolchain says nothing about this business.
 *  - The centre uses the local logo asset. The original pointed at a third-party CDN, which
 *    would put a render-blocking external request (and a broken hero if it ever 404s) on the
 *    marketing page's critical path.
 *  - Built on the Button/Card already in this codebase, so it adds no UI dependency; `motion`
 *    is already a dependency for the rest of the marketing page's animation.
 *
 * The whole diagram is aria-hidden: every node's label is repeated as real text in the timeline
 * directly beneath it, so announcing it twice would only add noise.
 */

// The viewBox this diagram is authored against. Node positions are absolute inside it and are
// converted to percentages below, so the whole thing scales with its container.
const VIEW_W = 564;
const VIEW_H = 410;

interface Node {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  x: number;
  y: number;
  /** Connector from the centre hub (roughly 282,205) out to the node. */
  path: string;
  delay: number;
}

const NODES: Node[] = [
  {
    id: "quote",
    icon: FileText,
    label: "Quote",
    x: 110,
    y: 90,
    path: "M 270 205 V 105 Q 270 90 255 90 H 110",
    delay: 0.1,
  },
  {
    id: "pickup",
    icon: CalendarClock,
    label: "Pickup",
    x: 360,
    y: 70,
    path: "M 294 205 V 85 Q 294 70 309 70 H 360",
    delay: 0.2,
  },
  {
    id: "packing",
    icon: PackageCheck,
    label: "Packing",
    x: 160,
    y: 205,
    path: "M 250 205 H 160",
    delay: 0.3,
  },
  {
    id: "customs",
    icon: ShieldCheck,
    label: "Customs",
    x: 480,
    y: 205,
    path: "M 314 205 H 480",
    delay: 0.4,
  },
  {
    id: "freight",
    icon: Plane,
    label: "Air freight",
    x: 282,
    y: 360,
    path: "M 282 205 V 360",
    delay: 0.6,
  },
  {
    id: "delivery",
    icon: MapPin,
    label: "Delivery",
    x: 460,
    y: 340,
    path: "M 314 215 V 325 Q 314 340 329 340 H 460",
    delay: 0.7,
  },
];

/**
 * One connector: a static hairline plus a gradient dash travelling along it.
 *
 * The travelling pulse is a `strokeDashoffset` animation rather than a motion path — one
 * animated property, no layout, so six of these stay cheap. Each gradient needs a document-unique
 * id, hence the `useId` prefix passed down from the parent.
 */
function Connector({ d, id, delay }: { d: string; id: string; delay: number }) {
  return (
    <>
      <path d={d} stroke="currentColor" strokeWidth="1" fill="none" className="text-border" />
      <motion.path
        d={d}
        stroke={`url(#${id})`}
        strokeWidth="2"
        fill="none"
        strokeDasharray="40 160"
        initial={{ strokeDashoffset: 200 }}
        animate={{ strokeDashoffset: -200 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear", delay }}
      />
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="var(--color-primary)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </>
  );
}

export function DeliveryNetwork({ className }: { className?: string }) {
  const uid = useId();

  return (
    <div
      className={cn(
        "relative flex aspect-[564/460] w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-8 sm:aspect-[564/410]",
        className,
      )}
      aria-hidden
    >
      {/* Dotted ground, so the connectors read as sitting on a plane rather than floating. */}
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--color-foreground) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-card/70 via-transparent to-card/70" />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        fill="none"
      >
        {NODES.map((node) => (
          <Connector
            key={node.id}
            d={node.path}
            id={`${uid}-${node.id}`}
            delay={node.delay}
          />
        ))}
      </svg>

      {/* The hub */}
      <div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-border bg-background p-1.5 shadow-lg sm:rounded-2xl sm:p-2.5">
        <Image
          src="/assets/logo/logo-mark.png"
          alt=""
          width={36}
          height={36}
          className="size-6 object-contain sm:size-9"
        />
        <motion.span
          className="absolute inset-0 rounded-xl border-2 border-primary/25 sm:rounded-2xl"
          animate={{ scale: [1, 1.18, 1], opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </div>

      {/* The stages */}
      {NODES.map((node) => {
        const Icon = node.icon;
        return (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: node.delay }}
            style={{
              left: `${(node.x / VIEW_W) * 100}%`,
              top: `${(node.y / VIEW_H) * 100}%`,
            }}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm sm:h-12 sm:w-12">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="whitespace-nowrap text-[10px] font-medium text-muted-foreground sm:text-xs">
              {node.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
