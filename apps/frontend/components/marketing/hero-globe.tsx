"use client";

import createGlobe, { type COBEOptions } from "cobe";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

// Mumbai — India's primary maritime/logistics hub, the globe's highlighted origin marker.
const INDIA: [number, number] = [19.076, 72.8777];

// One representative hub per region NationWide ships to, kept deliberately short so the globe
// reads as "India to the world," not a crowded traffic map — see frontend-design SKILL.md,
// "avoid overcrowding."
const DESTINATIONS: [number, number][] = [
  [25.2048, 55.2708], // Dubai — Middle East
  [51.5074, -0.1278], // London — Europe
  [1.3521, 103.8198], // Singapore — Southeast Asia
  [31.2304, 121.4737], // Shanghai — East Asia
  [40.7128, -74.006], // New York — North America
];

// Colors are normalized (0-1) RGB pulled from the brand tokens in globals.css so the globe reads
// as native to the theme rather than a pasted-in demo: --brand-blue, --brand-blue-bright, and the
// #17B8E8 route-line blue already used by MarketingGlobalReach's SVG arcs.
const LAND_COLOR: [number, number, number] = [0.16, 0.42, 0.66];
const MARKER_COLOR: [number, number, number] = [0.1176, 0.5333, 0.898];
const INDIA_MARKER_COLOR: [number, number, number] = [0.85, 0.95, 1];
const GLOW_COLOR: [number, number, number] = [0.0706, 0.3804, 0.6275];
const ARC_COLOR: [number, number, number] = [0.0902, 0.7216, 0.9098];

const INITIAL_PHI = -1.27; // centers roughly on India at rest, before auto-rotation takes over
const AUTO_ROTATE_SPEED = 0.0028;

const BASE_CONFIG: Omit<COBEOptions, "width" | "height" | "devicePixelRatio"> = {
  phi: INITIAL_PHI,
  theta: 0.32,
  dark: 1,
  diffuse: 0.65,
  scale: 1.05,
  mapSamples: 15000,
  mapBrightness: 6.5,
  baseColor: LAND_COLOR,
  markerColor: MARKER_COLOR,
  glowColor: GLOW_COLOR,
  opacity: 0.92,
  markers: [
    { location: INDIA, size: 0.1, color: INDIA_MARKER_COLOR },
    ...DESTINATIONS.map((location) => ({ location, size: 0.055, color: MARKER_COLOR })),
  ],
  arcs: DESTINATIONS.map((to) => ({ from: INDIA, to, color: ARC_COLOR })),
  arcColor: ARC_COLOR,
  arcWidth: 1.4,
  arcHeight: 0.32,
};

export function HeroGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(INITIAL_PHI);
  const dragOffsetRef = useRef(0);
  const pointerInteracting = useRef<number | null>(null);
  const pointerMovement = useRef(0);
  const [isReady, setIsReady] = useState(false);

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = value !== null ? "grabbing" : "grab";
    }
  };

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current === null) return;
    const delta = clientX - pointerInteracting.current;
    pointerMovement.current = delta;
    dragOffsetRef.current = delta / 200;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let width = canvas.offsetWidth;

    // cobe v2 dropped the old `onRender` callback in favor of an explicit `update()` method —
    // continuous rotation means driving our own rAF loop and pushing phi every frame.
    const globe = createGlobe(canvas, {
      ...BASE_CONFIG,
      width: width * 2,
      height: width * 2,
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });

    const onResize = () => {
      width = canvas.offsetWidth;
      globe.update({ width: width * 2, height: width * 2 });
    };
    window.addEventListener("resize", onResize);

    let frameId = 0;
    const frame = () => {
      if (pointerInteracting.current === null) {
        phiRef.current += AUTO_ROTATE_SPEED;
      }
      globe.update({ phi: phiRef.current + dragOffsetRef.current });
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    const revealTimer = window.setTimeout(() => setIsReady(true), 40);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(revealTimer);
      globe.destroy();
    };
  }, []);

  return (
    <div className={cn("relative aspect-square w-full", className)}>
      <canvas
        ref={canvasRef}
        className={cn(
          "size-full [contain:layout_paint_size] transition-opacity duration-700 ease-out",
          isReady ? "opacity-100" : "opacity-0",
        )}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => updatePointerInteraction(e.clientX - pointerMovement.current)}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) => {
          if (e.touches[0]) updateMovement(e.touches[0].clientX);
        }}
      />
    </div>
  );
}
