"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The full-page loading treatment: a rotating wireframe cube over a cycling status word.
 *
 * Differences from the reference implementation this came from, all deliberate:
 *  - `statuses` lives at module scope. In the original it was rebuilt every render and then used
 *    as an effect dependency, which re-armed the interval on each tick.
 *  - The face glyph is sized with an inline style, not `text-[${n}px]`. Tailwind only ships
 *    classes it can see as literal strings at build time, so an interpolated arbitrary value
 *    compiles to nothing and the prop silently does nothing.
 *  - `prefers-reduced-motion` stops the rotation and the word cycling; a spinning 3-D object is
 *    exactly the kind of motion that setting exists to suppress.
 */

const STATUSES = ["Fetching", "Fixing", "Updating", "Placing", "Syncing", "Processing"] as const;

/** Face order matches the transform list below: front, back, right, left, top, bottom. */
const FACE_TRANSFORMS = [
  "rotateY(0deg)",
  "rotateY(180deg)",
  "rotateY(90deg)",
  "rotateY(-90deg)",
  "rotateX(90deg)",
  "rotateX(-90deg)",
];

const ROTATION_TICK_MS = 16;
const STATUS_TICK_MS = 600;

/**
 * matchMedia is an external store, so it is read through useSyncExternalStore rather than an
 * effect that calls setState — the effect version renders once with motion on and then again
 * with it off, which is a visible flash of the very animation the setting asks to suppress.
 * The server snapshot is `false`: SSR has no media queries, and the client corrects on hydration.
 */
function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function PrismFluxLoader({
  size = 30,
  speed = 5,
  glyphSize = 16,
  /**
   * What is being waited on ("Loading your shipments"). Shown under the cube in place of the
   * cycling words, because a specific label tells someone what is happening where a generic
   * one only says that something is.
   */
  label,
  className,
}: {
  size?: number;
  speed?: number;
  glyphSize?: number;
  label?: string;
  className?: string;
}) {
  const [time, setTime] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setTime((t) => t + 0.02 * speed), ROTATION_TICK_MS);
    return () => clearInterval(id);
  }, [speed, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || label) return;
    const id = setInterval(
      () => setStatusIndex((i) => (i + 1) % STATUSES.length),
      STATUS_TICK_MS,
    );
    return () => clearInterval(id);
  }, [reduceMotion, label]);

  const half = size / 2;

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4", className)}
      role="status"
      // The cycling word is decoration, not progress. Announcing every 600ms change would make
      // a screen reader unusable, so the live region carries one stable sentence instead.
      aria-label={label ?? "Loading"}
    >
      <div
        className="relative"
        style={{
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          transform: `rotateY(${time * 30}deg) rotateX(${time * 30}deg)`,
        }}
        aria-hidden
      >
        {FACE_TRANSFORMS.map((transform, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center font-semibold text-foreground"
            style={{
              width: size,
              height: size,
              fontSize: glyphSize,
              border: "1px solid currentColor",
              transform: `${transform} translateZ(${half}px)`,
              backfaceVisibility: "hidden",
            }}
          >
            <Plus style={{ width: glyphSize, height: glyphSize }} />
          </div>
        ))}
      </div>

      <p className="text-sm font-semibold tracking-wide text-muted-foreground" aria-hidden>
        {label ?? `${STATUSES[statusIndex]}…`}
      </p>
    </div>
  );
}

/**
 * A whole page or panel waiting. Centred, with enough vertical room that it sits in the middle
 * of the content area rather than hugging the header.
 */
export function FullPageLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-[60vh] flex-1 items-center justify-center py-16", className)}>
      <PrismFluxLoader size={36} glyphSize={18} label={label} />
    </div>
  );
}
